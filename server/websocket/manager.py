from collections import defaultdict


class ConnectionManager:
    def __init__(self):
        self.connections = defaultdict(set)

    async def connect(self, websocket, channel: str, subprotocol: str | None = None):
        await websocket.accept(subprotocol=subprotocol)
        self.connections[channel].add(websocket)

    def disconnect(self, websocket, channel: str):
        self.connections[channel].discard(websocket)

    async def broadcast(self, message: dict, channel: str = "global"):
        clients = set(self.connections[channel])
        if channel != "global":
            clients.update(self.connections["global"])
        for websocket in clients:
            try:
                await websocket.send_json(message)
            except Exception:
                for connections in self.connections.values():
                    connections.discard(websocket)


manager = ConnectionManager()