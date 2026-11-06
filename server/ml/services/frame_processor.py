"""Frame sampling helper for video pipelines once a trained provider is configured."""

def sample_frame_indices(frame_count: int, interval: int) -> list[int]:
    if frame_count <= 0 or interval <= 0:
        return []
    indices = list(range(0, frame_count, interval))
    if indices and indices[-1] != frame_count - 1:
        indices.append(frame_count - 1)
    return indices