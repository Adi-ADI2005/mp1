from fastapi import Request


def get_database(request: Request | None = None):
    if request is not None:
        return request.app.state.database
    from fastapi import Request as RequestType
    from ..app_state import current_database

    database = current_database.get()
    if database is None:
        raise RuntimeError("Database is not ready.")
    return database