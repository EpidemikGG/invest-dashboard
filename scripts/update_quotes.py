#!/usr/bin/env python3
"""Fetch the current portfolio prices from Twelve Data and write a public snapshot.

The API key is read only from the GitHub Actions environment and is sent in the
recommended Authorization header. It is never written to the repository.
"""
from __future__ import annotations

import json
import math
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

API_KEY = os.environ.get("TWELVE_DATA_API_KEY", "").strip()
API_BASE = "https://api.twelvedata.com"
SNAPSHOT = Path("data/quotes.json")
INSTRUMENTS = {
    "MSFT": {"exchange": "NASDAQ"},
    "BRK.B": {"exchange": "NYSE"},
    "GOOGL": {"exchange": "NASDAQ"},
    "VWCE": {"exchange": "Xetra", "type": "ETF"},
}
TRANSIENT_CODES = {429, 500, 502, 503, 504}


def utc_iso(value: object) -> str:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        stamp = datetime.fromtimestamp(value, tz=timezone.utc)
    elif isinstance(value, str) and value.strip().isdigit():
        stamp = datetime.fromtimestamp(int(value.strip()), tz=timezone.utc)
    elif isinstance(value, str):
        stamp = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        if stamp.tzinfo is None:
            stamp = stamp.replace(tzinfo=timezone.utc)
        stamp = stamp.astimezone(timezone.utc)
    else:
        raise ValueError("Missing quote timestamp")
    return stamp.isoformat(timespec="seconds").replace("+00:00", "Z")


def request_json(endpoint: str, params: dict[str, str]) -> dict:
    query = urlencode(params)
    request = Request(
        f"{API_BASE}/{endpoint}?{query}",
        headers={
            "Authorization": f"apikey {API_KEY}",
            "Accept": "application/json",
            "User-Agent": "invest-dashboard-quote-updater",
        },
    )
    for attempt in range(3):
        try:
            with urlopen(request, timeout=25) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            try:
                payload = json.loads(error.read().decode("utf-8"))
            except Exception:
                payload = {}
            message = str(payload.get("message") or error.reason or "request failed")
            if error.code in TRANSIENT_CODES and attempt < 2:
                time.sleep(2 ** attempt)
                continue
            raise RuntimeError(f"Twelve Data HTTP {error.code}: {message}") from None
        except URLError as error:
            if attempt < 2:
                time.sleep(2 ** attempt)
                continue
            raise RuntimeError(f"Twelve Data connection failed: {error.reason}") from None

        if not isinstance(payload, dict):
            raise RuntimeError("Twelve Data returned an unexpected response")
        status = str(payload.get("status", "")).lower()
        if status == "error" or ("code" in payload and "message" in payload):
            try:
                code = int(payload.get("code", 0))
            except (TypeError, ValueError):
                code = 0
            message = str(payload.get("message", "API request failed"))
            if code in TRANSIENT_CODES and attempt < 2:
                time.sleep(2 ** attempt)
                continue
            raise RuntimeError(f"Twelve Data error {code}: {message}")
        return payload
    raise RuntimeError("Twelve Data request failed after retries")


def positive_number(value: object) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValueError("Missing price") from None
    if not math.isfinite(number) or number <= 0:
        raise ValueError("Invalid price")
    return number


def fetch_fx_rate(currency: str) -> tuple[float, str | None]:
    payload = request_json("exchange_rate", {"symbol": f"{currency}/USD"})
    rate = positive_number(payload.get("rate"))
    timestamp = utc_iso(payload["timestamp"]) if payload.get("timestamp") else None
    return rate, timestamp


def fetch_quote(ticker: str, config: dict[str, str]) -> dict:
    params = {
        "symbol": ticker,
        "exchange": config["exchange"],
        "interval": "1min",
        "prepost": "true",
        "timezone": "UTC",
    }
    if config.get("type"):
        params["type"] = config["type"]
    payload = request_json("quote", params)
    price = positive_number(payload.get("close"))
    currency = str(payload.get("currency") or "").upper()
    if not currency:
        raise ValueError("Twelve Data did not return the quote currency")
    timestamp_value = payload.get("last_quote_at") or payload.get("datetime")
    quote_time = utc_iso(timestamp_value)
    fx_rate = None
    if currency != "USD":
        fx_rate, fx_time = fetch_fx_rate(currency)
        price *= fx_rate
        if fx_time and datetime.fromisoformat(fx_time.replace("Z", "+00:00")) < datetime.fromisoformat(quote_time.replace("Z", "+00:00")):
            quote_time = fx_time
    return {
        "price": round(price, 8),
        "price_time": quote_time,
        "currency": "USD",
        "source": "Twelve Data",
        "exchange": str(payload.get("exchange") or config["exchange"]),
        **(
            {"original_currency": currency, "fx_pair": f"{currency}/USD", "fx_rate": fx_rate}
            if fx_rate is not None else {}
        ),
    }


def load_previous_quotes() -> dict:
    try:
        value = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
        return value.get("quotes", {}) if isinstance(value, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def main() -> None:
    if not API_KEY:
        raise SystemExit("Missing TWELVE_DATA_API_KEY repository secret")
    previous = load_previous_quotes()
    quotes: dict[str, dict] = {}
    errors: dict[str, str] = {}

    for ticker, config in INSTRUMENTS.items():
        try:
            quotes[ticker] = fetch_quote(ticker, config)
            print(f"Fetched Twelve Data quote for {ticker}")
        except Exception as error:
            message = str(error).replace(API_KEY, "[redacted]")
            errors[ticker] = message[:400]
            old = previous.get(ticker)
            if isinstance(old, dict) and old.get("source") == "Twelve Data":
                quotes[ticker] = old
            print(f"Could not refresh {ticker}: {errors[ticker]}")

    if not quotes:
        raise SystemExit("Twelve Data returned no usable portfolio quotes; snapshot was not changed")

    snapshot = {
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "quotes": quotes,
    }
    if errors:
        snapshot["errors"] = errors
    SNAPSHOT.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(quotes)} Twelve Data quote(s) to {SNAPSHOT}")


if __name__ == "__main__":
    main()
