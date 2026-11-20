"""Validate UADS declarations and referenced local evidence."""

import json
from datetime import date
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[1]


def load(relative_path):
    return json.loads((ROOT / relative_path).read_text(encoding="utf-8"))


def main():
    manifest = load("uads.json")
    schema = load("config/uads-schema.json")
    Draft202012Validator.check_schema(schema)
    Draft202012Validator(schema, format_checker=FormatChecker()).validate(manifest)
    registry = {item["id"]: item for item in load("config/uads-requirements.json")}
    entries = manifest["requirements"]
    identifiers = [item["id"] for item in entries]
    if len(identifiers) != len(set(identifiers)) or set(identifiers) != registry.keys():
        raise ValueError("Requirement IDs must match the registry, once per ID.")

    exception_ids = set()
    for exception in manifest["exceptions"]:
        identifier = exception["requirementId"]
        if identifier not in registry or identifier in exception_ids:
            raise ValueError(f"Invalid or duplicate exception for {identifier}")
        if not date.fromisoformat(exception["approvedOn"]) <= date.today() <= date.fromisoformat(exception["reviewOn"]):
            raise ValueError(f"Exception dates are outside the approved range for {identifier}")
        exception_ids.add(identifier)

    for requirement in entries:
        identifier = requirement["id"]
        if requirement["applicability"] != registry[identifier]["applicability"]:
            raise ValueError(f"Applicability mismatch for {identifier}")
        if (requirement["state"] == "waived") != (identifier in exception_ids):
            raise ValueError(f"Missing or inconsistent waiver for {identifier}")
        for reference in requirement["references"]:
            path = (ROOT / reference).resolve()
            if not path.is_relative_to(ROOT) or not path.is_file():
                raise ValueError(f"Missing repository reference for {identifier}")
    print(f"Validated {len(entries)} declarations and their local references.")


if __name__ == "__main__":
    main()
