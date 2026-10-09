"""
Fase 7C - envio de correo.

Regla de oro: si el envio falla, la funcion lo dice. Nunca se informa de un
correo "enviado" si no se ha enviado: un falso positivo haria creer al usuario
que su correo esta en camino cuando no lo esta.

Proveedores:
  - 'console' (por defecto, DESARROLLO): imprime el enlace en la salida
    estandar y lo deja registrado como `delivered=False`. Es un modo
    claramente identificado, no una simulacion de exito.
  - 'smtp': envio real con la biblioteca estandar `smtplib`.

Las pruebas inyectan un doble de prueba, de modo que nunca sale correo real.
"""
import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

log = logging.getLogger(__name__)

RESET_SUBJECT = 'Recuperar acceso - Marimba Organizer'
RESET_BODY = (
    'Hola,\n\n'
    'Has solicitado restablecer la contrasena de tu cuenta de Marimba Organizer.\n'
    'Abre este enlace para elegir una nueva contrasena (vigente por tiempo limitado):\n\n'
    '{link}\n\n'
    'Si no has sido tu, ignora este mensaje: tu contrasena actual sigue siendo valida.\n'
)


class MailError(RuntimeError):
    """El envio no se pudo completar. La API debe propagarlo como error."""


def _send_smtp(to_email:str,subject:str,body:str)->None:
    if not settings.smtp_host:
        raise MailError('No hay SMTP_HOST configurado.')
    msg=EmailMessage()
    msg['Subject']=subject
    msg['From']=settings.mail_from
    msg['To']=to_email
    msg.set_content(body)
    try:
        with smtplib.SMTP(settings.smtp_host,settings.smtp_port,timeout=20) as s:
            if settings.smtp_use_tls:
                s.starttls()
            if settings.smtp_user:
                s.login(settings.smtp_user,settings.smtp_password)
            s.send_message(msg)
    except (smtplib.SMTPException,OSError) as e:
        # Se registra el motivo, nunca el token ni la contrasena.
        raise MailError('El servidor de correo rechazo el envio.') from e


def _send_console(to_email:str,subject:str,body:str)->None:
    # Modo de desarrollo explicito: queda en la consola del servidor.
    log.warning(
        '[MODO DESARROLLO] Correo NO enviado. Se muestra aqui para pruebas '
        'locales. Destinatario: %s\nAsunto: %s\n%s',to_email,subject,body)


def send_mail(to_email:str,subject:str,body:str)->bool:
    """
    Envia un correo. Devuelve True solo si el envio se realizo de verdad.

    Lanza MailError si el proveedor fallo, para que la ruta pueda avisar al
    usuario en lugar de fingir exito.
    """
    provider=(settings.mail_provider or 'console').lower()
    if provider=='smtp':
        _send_smtp(to_email,subject,body)
        return True
    if provider=='console':
        _send_console(to_email,subject,body)
        return False
    raise MailError('Proveedor de correo desconocido: %s' % provider)


def mail_configured()->bool:
    """True solo si hay un proveedor REAL configurado."""
    return (settings.mail_provider or '').lower()=='smtp' and bool(settings.smtp_host)


def build_reset_link(token:str)->str:
    base=settings.public_base_url.rstrip('/')
    return '%s/reset-password?token=%s' % (base,token)


def send_reset_email(to_email:str,token:str)->bool:
    """Envia el enlace de recuperacion. Devuelve si el correo salio de verdad."""
    return send_mail(to_email,RESET_SUBJECT,
                     RESET_BODY.format(link=build_reset_link(token)))
