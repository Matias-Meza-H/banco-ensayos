"""Lectura con Claude (opción a): llamada a la API de Anthropic desde el servidor local.

Reemplaza la capacidad `sample` que la plataforma usaba en claude.ai. La clave NUNCA va en el código:
el SDK oficial la toma del entorno (ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN o un perfil de `ant auth login`).
Si el paquete `anthropic` no está instalado o no hay credenciales, la lectura queda deshabilitada y la
aplicación sigue funcionando (los documentos se suben igual como evidencia).

Configuración por variables de entorno:
  APAS_CLAUDE=0              desactiva la lectura aunque haya credenciales
  APAS_CLAUDE_MODEL          modelo (por defecto claude-opus-5-5)
"""
import base64
import os

MODEL = os.environ.get('APAS_CLAUDE_MODEL', 'claude-opus-5-5')
# modelTier de la plataforma -> esfuerzo (effort) del modelo
EFFORT = {'quick': 'low', 'default': 'medium', 'complex': 'high'}
MAX_IMAGES = 8

try:
    import anthropic
except ImportError:  # la lectura es opcional
    anthropic = None

_client = None


class ClaudeError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code, self.message = code, message


def estado():
    if os.environ.get('APAS_CLAUDE', '1') == '0':
        return {'disponible': False, 'motivo': 'Desactivada con APAS_CLAUDE=0.'}
    if anthropic is None:
        return {'disponible': False, 'motivo': 'Falta el paquete anthropic (pip install anthropic).'}
    if not (os.environ.get('ANTHROPIC_API_KEY') or os.environ.get('ANTHROPIC_AUTH_TOKEN') or os.environ.get('ANTHROPIC_PROFILE')
            or os.path.isdir(os.path.expanduser('~/.config/anthropic'))):
        return {'disponible': False, 'motivo': 'Sin credenciales: define ANTHROPIC_API_KEY en el entorno o usa `ant auth login`.'}
    return {'disponible': True, 'modelo': MODEL, 'maxImagenes': MAX_IMAGES}


def client():
    global _client
    if _client is None:
        _client = anthropic.Anthropic()
    return _client


def leer(prompt, images=None, tier='default'):
    """prompt: texto o lista de mensajes [{role, content}]; images: [{media_type, data(base64)}]. Devuelve el texto."""
    st = estado()
    if not st['disponible']:
        raise ClaudeError('not_granted', st['motivo'])
    images = images or []
    if len(images) > MAX_IMAGES:
        raise ClaudeError('invalid_argument', f'Máximo {MAX_IMAGES} imágenes por lectura.')
    for im in images:
        base64.b64decode(im['data'], validate=True)  # rechaza datos corruptos antes de llamar a la API
    if isinstance(prompt, list):
        messages = prompt
    else:
        content = [{'type': 'image', 'source': {'type': 'base64', 'media_type': im['media_type'], 'data': im['data']}} for im in images]
        content.append({'type': 'text', 'text': str(prompt)})
        messages = [{'role': 'user', 'content': content}]
    try:
        with client().beta.messages.stream(
            model=MODEL,
            max_tokens=32000,
            output_config={'effort': EFFORT.get(tier, 'medium')},
            betas=['server-side-fallback-2026-07-01'],
            fallbacks='default',
            messages=messages,
        ) as stream:
            msg = stream.get_final_message()
    except anthropic.RateLimitError:
        raise ClaudeError('rate_limited', 'Claude está ocupado; intenta en unos minutos.')
    except anthropic.AuthenticationError:
        raise ClaudeError('not_granted', 'La credencial de Anthropic no es válida.')
    except anthropic.BadRequestError as e:
        raise ClaudeError('invalid_argument', e.message)
    except anthropic.APIStatusError as e:
        raise ClaudeError('unavailable', f'Error de la API ({e.status_code}).')
    except anthropic.APIConnectionError:
        raise ClaudeError('unavailable', 'Sin conexión con la API de Anthropic.')
    if msg.stop_reason == 'refusal':
        raise ClaudeError('refused', 'Claude declinó leer este documento.')
    text = ''.join(b.text for b in msg.content if b.type == 'text')
    return {'text': text, 'truncated': msg.stop_reason == 'max_tokens', 'modelo': msg.model}
