class ProxfleetError(Exception):
    """Base class for all Proxfleet exceptions."""
    pass

class ProxmoxAPIError(ProxfleetError):
    """Raised when the Proxmox API returns an unexpected error code."""
    pass

class ProxmoxConnectionError(ProxfleetError):
    """"""
    def __init__(self,host:str):
        self.host = host
        self.message = f"Proxmox server {host} unreachable"



class ProxmoxResourceNotFoundError(ProxfleetError):
    """Raised when a VM, Storage, or Pool is not found on the node."""
    def __init__(self, resource_type: str, resource_id: str, host: str):
        self.resource_type = resource_type # ex: "VM", "Storage", "Pool"
        self.resource_id = resource_id
        self.host = host
        self.message = f"{resource_type.capitalize()} '{resource_id}' was not found on host {host}."
        super().__init__(self.message)


class ProxmoxTaskTimeoutError(ProxfleetError):
    """Raised when a Proxmox task (upid) takes too long to complete."""
    def __init__(self, upid: str, timeout: int, host: str):
        self.upid = upid
        self.timeout = timeout
        self.host = host
        self.message = f"Task {upid} on {host} timed out after {timeout} seconds."
        super().__init__(self.message)

class ProxmoxUnauthorizedError(ProxfleetError):
    """Raised when a user attempts to access a Proxmox host without permission."""
    def __init__(self, host: str, user: str, reason: str = "Access denied"):
        self.host = host
        self.user = user
        self.reason = reason
        self.message = f"User '{user}' is unauthorized to access host '{host}'. {reason}."
        super().__init__(self.message)

class ProxmoxInvalidTokenError(ProxfleetError):
    """Raised when the API token data in the session is corrupted or missing."""
    def __init__(self, host: str, token_id: str = None):
        self.host = host
        self.token_id = token_id
        self.message = f"Invalid or incomplete token data for host '{host}' (ID: {token_id})."
        super().__init__(self.message)