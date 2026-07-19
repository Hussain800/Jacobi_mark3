"""Travel-domain exceptions."""


class TravelDomainError(ValueError):
    """Base class for deterministic travel-domain validation failures."""


class MoneyValidationError(TravelDomainError):
    pass


class CostValidationError(TravelDomainError):
    pass


class IntentValidationError(TravelDomainError):
    pass

