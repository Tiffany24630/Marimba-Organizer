"""Motor de distribucion (fachada): re-exporta engine_a/b/c/d en un solo modulo."""
from app.services.suggestions.engine_a import get_previous_song, get_real_slots, get_previous_assignment_map
from app.services.suggestions.engine_d import propose_distribution
from app.services.suggestions.engine_c import get_distribution_for_song

__all__ = ['get_previous_song', 'get_real_slots',
           'get_previous_assignment_map', 'propose_distribution',
           'get_distribution_for_song']