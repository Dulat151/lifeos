"""SMTP email sender. When SMTP is not configured, raises EmailNotConfigured (never fakes success)."""
import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

log = logging.getLogger("lifeos.email")


class EmailNotConfigured(RuntimeError):
    pass


def send_email(to: str, subject: str, body: str) -> None:
    if not settings.smtp_host:
        raise EmailNotConfigured("SMTP не настроен (SMTP_HOST пуст)")
    msg = EmailMessage()
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as s:
        if settings.smtp_tls:
            s.starttls()
        if settings.smtp_user:
            s.login(settings.smtp_user, settings.smtp_password)
        s.send_message(msg)


def try_send(to: str, subject: str, body: str) -> bool:
    """For auth emails: returns False when not configured; in development the link is logged for the developer."""
    try:
        send_email(to, subject, body)
        return True
    except EmailNotConfigured:
        if settings.environment != "production":
            log.warning("SMTP not configured. Email to %s not sent. Body:\n%s", to, body)
        return False
    except Exception:  # noqa: BLE001
        log.exception("Email delivery failed")
        return False
