"""
Fase 7C - utilidades de seguridad (SOLO biblioteca estandar).

Decision: no se anade ninguna dependencia nueva para el hash de contrasenas.
El proyecto funciona en una imagen Docker de Python y anadir bcrypt/argon2
exigiria un modulo nativo compilado. Se usa PBKDF2-HMAC-SHA256, que es el
algoritmo de derivacion de clave que recomienda NIST (SP 800-132) cuando no
hay un KDF resistente a memoria disponible, con un numero alto de iteraciones
y sal aleatoria por usuario.

Formato del hash (auto-descriptivo, permite migrar de algoritmo en el futuro):
    pbkdf2_sha256$<iteraciones>$<sal_hex>$<hash_hex>

`PBKDF2_ITERATIONS` permite reducir el coste SOLO en la suite de pruebas, que
crea miles de usuarios. En cualquier despliegue real se queda en el valor
por defecto. El hash guardado incluye las iteraciones usadas, asi que un
hash creado con un coste bajo no se confunde con uno de coste alto.

Lo que NUNCA se hace aqui: registrar contrasenas, tokens ni sus hashes.
"""
import hashlib
import hmac
import os
import secrets

# 600.000 iteraciones = ~0.3 s por verificacion en hardware de escritorio.
# Es deliberadamente lento: encarece la fuerza bruta offline.
PBKDF2_ITERATIONS = max(1, int(os.environ.get('PBKDF2_ITERATIONS',
                                               '600000')))
SALT_BYTES = 16
# Longitud del token opaco de sesion / recuperacion, en bytes.
TOKEN_BYTES = 32


def hash_password(password:str,iterations:int=PBKDF2_ITERATIONS)->str:
    """Devuelve el hash auto-descriptivo. NUNCA devolver ni registrar la entrada."""
    if not isinstance(password,str) or not password:
        raise ValueError('La contrasena no puede estar vacia.')
    salt=secrets.token_bytes(SALT_BYTES)
    dk=hashlib.pbkdf2_hmac('sha256',password.encode('utf-8'),salt,iterations)
    return 'pbkdf2_sha256${}${}${}'.format(iterations,salt.hex(),dk.hex())


def verify_password(password:str,stored:str)->bool:
    """
    Verifica una contrasena contra el hash guardado.

    Devuelve False (no lanza) ante cualquier dato corrupto, para que un hash
    invalido en la base no provoque un 500 con detalle interno.
    """
    if not password or not stored:
        return False
    try:
        algorithm,iterations,salt_hex,hash_hex=stored.split('$',3)
        if algorithm!='pbkdf2_sha256':
            return False
        dk=hashlib.pbkdf2_hmac('sha256',password.encode('utf-8'),
                               bytes.fromhex(salt_hex),int(iterations))
    except (ValueError,TypeError):
        return False
    return hmac.compare_digest(dk.hex(),hash_hex)


def needs_rehash(stored:str)->bool:
    """Indica si el hash guardado usa parametres mas debiles que los actuales."""
    try:
        algorithm,iterations,_salt,_h=stored.split('$',3)
        return algorithm!='pbkdf2_sha256' or int(iterations)<PBKDF2_ITERATIONS
    except (ValueError,TypeError):
        return True


def new_token()->str:
    """Token opaco, criptograficamente aleatorio y con suficiente entropia."""
    return secrets.token_urlsafe(TOKEN_BYTES)


def token_fingerprint(token:str)->str:
    """
    Huella SHA-256 del token.

    Es lo que se guarda en la base. Asi una filtracion de la tabla de sesiones
    NO permite autenticarse: el atacante necesitaria el token en claro.
    """
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def constant_time_equals(a:str,b:str)->bool:
    """Comparacion en tiempo constante, para no filtrar informacion por tiempos."""
    if not a or not b:
        return False
    return hmac.compare_digest(a,b)


def password_problem(password:str)->str|None:
    """
    Valida una contrasena. Devuelve un mensaje en espanol o None si es valida.
    Se usa tanto al crear usuarios como al restablecer, para no tener dos
    criterios distintos.
    """
    if not isinstance(password,str):
        return 'La contrasena no es valida.'
    if len(password)<10:
        return 'La contrasena debe tener al menos 10 caracteres.'
    if len(password)>200:
        return 'La contrasena es demasiado larga (maximo 200 caracteres).'
    if not any(c.isalpha() for c in password):
        return 'La contrasena debe incluir al menos una letra.'
    if not any(c.isdigit() for c in password):
        return 'La contrasena debe incluir al menos un numero.'
    return None
