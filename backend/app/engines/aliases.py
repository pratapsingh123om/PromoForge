from __future__ import annotations

import re


_ALIAS_IS_PATTERN = re.compile(
    r"(?P<alias>[A-Za-z0-9\s'_-]+?)\s+(?:is|=|represents)\s+(?P<real>[A-Za-z0-9\s'_-]+)",
    re.IGNORECASE,
)
_PAREN_ALIAS_PATTERN = re.compile(
    r"(?P<real>[A-Za-z0-9\s'_-]+?)\s*\((?P<alias>[A-Za-z0-9\s'_-]+?)\)",
    re.IGNORECASE,
)


def extract_alias_map(continuity_notes: str, logline: str = "") -> dict[str, str]:
    """Extract character alias mapping from script continuity notes and logline.
    
    Example: 'The Former Groom is Gerald. Lady in Gold Gown is Clarissa.'
    -> {'the former groom': 'Gerald', 'lady in gold gown': 'Clarissa'}
    """
    mapping: dict[str, str] = {}
    combined = f"{continuity_notes}\n{logline}"

    for match in _ALIAS_IS_PATTERN.finditer(combined):
        alias = " ".join(match.group("alias").strip().split())
        real = " ".join(match.group("real").strip().split())
        if alias and real and len(alias) > 2 and len(real) > 2:
            # Clean punctuation
            clean_alias = alias.rstrip(".,;:")
            clean_real = real.rstrip(".,;:")
            mapping[clean_alias.lower()] = clean_real.title()

    for match in _PAREN_ALIAS_PATTERN.finditer(combined):
        real = " ".join(match.group("real").strip().split())
        alias = " ".join(match.group("alias").strip().split())
        if alias and real and len(alias) > 2 and len(real) > 2:
            clean_alias = alias.rstrip(".,;:")
            clean_real = real.rstrip(".,;:")
            mapping[clean_alias.lower()] = clean_real.title()

    return mapping


def canonicalize_speaker(
    speaker: str,
    alias_map: dict[str, str],
) -> tuple[str, bool]:
    """Returns (canonical_name, was_aliased).
    
    Handles suffixes like (O.S.), (Off-screen), etc.
    """
    if not speaker:
        return speaker, False

    clean = " ".join(speaker.strip().split())
    # Strip (O.S.) / (Off-screen) for lookup
    base = re.sub(r"\s*\((?:O\.S\.|Off-screen|V\.O\.|Voice-over)\)", "", clean, flags=re.I).strip()
    
    base_lower = base.lower()
    if base_lower in alias_map:
        return alias_map[base_lower], True

    # Check partial contains
    for alias_key, canonical in alias_map.items():
        if alias_key in base_lower or base_lower in alias_key:
            return canonical, True

    return base.title(), False


def find_unresolved_aliases(
    speakers: list[str],
    alias_map: dict[str, str],
) -> list[str]:
    """Identifies speaker labels that appear descriptive (e.g. 'MAN IN BLACK', 'WAITER')
    and lack an explicit alias definition in continuity notes.
    """
    unresolved = []
    descriptive_keywords = {
        "former", "lady", "man", "woman", "guy", "girl", "stranger",
        "figure", "voice", "in", "gown", "suit", "coat", "hood", "mask",
    }
    
    seen = set()
    for spk in speakers:
        if not spk:
            continue
        base = re.sub(r"\s*\((?:O\.S\.|Off-screen|V\.O\.|Voice-over)\)", "", spk, flags=re.I).strip()
        base_lower = base.lower()
        if base_lower in seen:
            continue
        seen.add(base_lower)

        words = set(base_lower.split())
        is_descriptive = bool(words & descriptive_keywords) or len(base.split()) >= 3
        is_mapped = (base_lower in alias_map) or any(k in base_lower for k in alias_map)

        if is_descriptive and not is_mapped:
            unresolved.append(base.title())

    return unresolved
