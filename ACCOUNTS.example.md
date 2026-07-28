# Accounts Configuration Reference

This file documents the required account shapes only. Never place real email
addresses, passwords, API keys, or production credentials in this repository.
Keep local credentials in the ignored `ACCOUNTS.md` file and deployment values
in Heroku config vars.

## Municipal administrators

Configure `SEED_MUNICIPAL_ADMINS_JSON` as a JSON array:

```json
[
  {
    "name": "<municipal-admin-name>",
    "email": "<municipal-admin-email>",
    "password": "<strong-unique-password>",
    "role": "municipal_admin",
    "assignedMunicipality": "<Cajidiocan|Magdiwang|San Fernando>"
  }
]
```

## Responder accounts

Configure `SEED_RESPONDER_ACCOUNTS_JSON` as a JSON array:

```json
[
  {
    "name": "<responder-name>",
    "email": "<responder-email>",
    "password": "<strong-unique-password>",
    "role": "responder",
    "agency": "<MDRRMO|PNP|SDH|BFP>",
    "assignedMunicipality": "<Cajidiocan|Magdiwang|San Fernando>"
  }
]
```

## Optional legacy cleanup

Configure `SEED_LEGACY_EMAILS_JSON` with account emails that the seed process
may remove. Do not copy actual values into this example.

```json
["<legacy-account-email>"]
```

## Security requirements

- Generate a different password for every account.
- Use Heroku config vars or a trusted secret manager for deployment values.
- Rotate credentials immediately if they are committed, shared, or exposed.
- Never commit `.env`, `ACCOUNTS.md`, exported database records, or seed values
  containing real credentials.
