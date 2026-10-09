"""
Fase 7G - creacion del PRIMER administrador.

Por que una CLI y no una variable de entorno ni un endpoint:

  * La API de administracion (`POST /admin/users`) crea SIEMPRE usuarios
    `role='user'`: por mucho que el cuerpo envie `role:'admin'`, el servidor
    lo ignora. Es decir, no existe forma de crear un administrador por HTTP, a
    proposito. Anadir un `/register-admin` seria justo lo que ese diseño evita.
  * Una variable de entorno en el arranque crearia el admin en CADA arranque
    (o exigiria marcarla como "ya hecha"), y quedaria en el entorno del proceso.
  * Una CLI se ejecuta cuando alguien lo decide a proposito y no deja nada
    activo despues.

Seguridad:

  * La contrasena se pide por `getpass` (no queda en el historial del terminal)
    y NUNCA se imprime, ni al exito ni al error.
  * Se reutiliza `password_problem` y `hash_password`: el admin se crea con el
    MISMO criterio de clave y el MISMO hash que el resto de cuentas.
  * Es idempotente en cuanto al efecto: si la cuenta ya existe no se duplica.
  * Un usuario normal no puede invocarlo: no es una via HTTP y hace falta
    acceso a la base de datos.

Uso:
    python -m app.cli create-admin --email admin@ejemplo.local
    python -m app.cli create-admin --email admin@ejemplo.local --password-file ruta
"""
import argparse
import getpass
import sys

from app.api.deps import normalize_email
from app.core.security import hash_password, password_problem
from app.db.session import SessionLocal
from app.models import User

# Códigos de salida para uso directo y para scripts de despliegue.
OK = 0
FALLO = 1

def crear_admin(email: str, password: str, nombre: str = None,
                forzar_promocion: bool = False) -> tuple[int, str]:
    """
    Crea (o promueve) el administrador indicado.

    Devuelve (codigo_de_salida, mensaje_sin_secretos).

    - Si la cuenta no existe: se crea con `role='admin'`.
    - Si ya existe como admin: no hace nada y lo dice (idempotente).
    - Si ya existe como usuario normal: NO se degrada ni se promueve en
      silencio. Se informa y hace falta `--promover` a proposito, para que una
      cuenta cualquiera no se convierta en administradora por error.
    """
    email = normalize_email(email)
    if not email or '@' not in email or len(email) > 255:
        return FALLO, 'El correo no es valido.'
    problem = password_problem(password)
    if problem:
        return FALLO, problem

    db = SessionLocal()
    try:
        u = db.query(User).filter(User.email == email).first()
        if u is not None:
            if u.role == 'admin':
                # Idempotente: repetir el comando no crea un segundo admin.
                return OK, ('La cuenta ya existe y ya era administradora. '
                            'No se ha creado nada nuevo.')
            if not forzar_promocion:
                return FALLO, (
                    'La cuenta ya existe como usuario NORMAL. Si de verdad se '
                    'quiere convertir en administradora, repetir con '
                    '--promover. No se hace nada todavia.')
            u.role = 'admin'
            if password:
                u.password_hash = hash_password(password)
            u.must_change_password = True
            u.active = True
            db.commit()
            return OK, 'La cuenta existente ha pasado a administradora.'

        db.add(User(name=(nombre or email.split('@')[0]),
                    email=email,
                    password_hash=hash_password(password),
                    role='admin', active=True,
                    must_change_password=True))
        # Un unico commit: o existe entero, o no existe. Nunca queda un admin
        # a medias si algo falla.
        db.commit()
        return OK, 'Administrador creado correctamente.'
    except Exception as e:  # pragma: no cover - defensivo
        db.rollback()
        # El mensaje del driver puede contener valores; no se imprime entero.
        return FALLO, ('No se pudo crear el administrador: %s'
                       % type(e).__name__)
    finally:
        db.close()


def _leer_password(args) -> str:
    """De donde sea que venga, sin imprimirla nunca."""
    if getattr(args, 'password_file', None):
        with open(args.password_file, 'r', encoding='utf-8') as f:
            return f.read().strip()
    if getattr(args, 'password', None):
        return args.password
    return getpass.getpass('Contrasena del administrador: ')


def main(argv=None) -> int:
    p = argparse.ArgumentParser(
        prog='python -m app.cli',
        description='Utilidades administrativas de Marimba Organizer.')
    sub = p.add_subparsers(dest='comando', required=True)
    ca = sub.add_parser(
        'create-admin',
        help='Crea el primer administrador. No imprime la contrasena.')
    ca.add_argument('--email', required=True, help='Correo del administrador.')
    ca.add_argument('--password', help=argparse.SUPPRESS)
    ca.add_argument('--password-file',
                    help='Fichero con la contrasena. Recomendado en '
                         'servidores: no queda en el historial del terminal.')
    ca.add_argument('--nombre', help='Nombre visible.')
    ca.add_argument('--promover', action='store_true',
                    help='Convierte en admin una cuenta existente. Sin esta '
                         'bandera NO se toca una cuenta que ya existe.')
    args = p.parse_args(argv)

    if args.comando == 'create-admin':
        codigo, mensaje = crear_admin(args.email, _leer_password(args),
                                      nombre=args.nombre,
                                      forzar_promocion=args.promover)
        # El mensaje jamas contiene la contrasena: `crear_admin` lo garantiza.
        print(mensaje)
        return codigo
    return FALLO  # pragma: no cover


if __name__ == '__main__':
    sys.exit(main())
