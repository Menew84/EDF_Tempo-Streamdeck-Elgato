#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EDF Tempo Local Helper v1.1.3
- HTTP server: http://127.0.0.1:9123/tempo  (today/tomorrow/yesterday + stats)
- Also: /stats  (stats only), /health

Sources:
Primary: api-couleur-tempo.fr (OpenAPI)
- /api/jourTempo/today
- /api/jourTempo/tomorrow
- /api/jourTempo/{date}
- /api/stats

Fallback (for today/tomorrow):
- EDF commerce endpoint calendrier-jours-effacement
"""
import argparse
import json
import os
import threading
import time
from datetime import datetime, timedelta, date
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse

import requests

CACHE_FILE = os.path.join(os.path.dirname(__file__), "tempo_cache.json")

def normalize_color(v: str) -> str:
    if not v:
        return "UNKNOWN"
    v = str(v).strip().upper()
    if "BLEU" in v or v == "BLUE" or v.endswith("_BLEU"):
        return "BLUE"
    if "BLANC" in v or v == "WHITE" or v.endswith("_BLANC"):
        return "WHITE"
    if "ROUGE" in v or v == "RED" or v.endswith("_ROUGE"):
        return "RED"
    return "UNKNOWN"

def code_to_color(code) -> str:
    try:
        c = int(code)
    except Exception:
        return "UNKNOWN"
    return {1: "BLUE", 2: "WHITE", 3: "RED"}.get(c, "UNKNOWN")

def _requests_get_json(url: str, timeout: int = 8):
    r = requests.get(url, timeout=timeout, headers={"User-Agent":"EDFTempoHelper/1.1.3"})
    r.raise_for_status()
    return r.json()

def fetch_primary():
    t = _requests_get_json("https://www.api-couleur-tempo.fr/api/jourTempo/today")
    d = _requests_get_json("https://www.api-couleur-tempo.fr/api/jourTempo/tomorrow")
    today = normalize_color(t.get("libCouleur")) if t.get("libCouleur") else code_to_color(t.get("codeJour"))
    tomorrow = normalize_color(d.get("libCouleur")) if d.get("libCouleur") else code_to_color(d.get("codeJour"))
    return today or "UNKNOWN", tomorrow or "UNKNOWN"

def fetch_primary_yesterday():
    y = (datetime.now().date() - timedelta(days=1)).isoformat()
    j = _requests_get_json(f"https://www.api-couleur-tempo.fr/api/jourTempo/{y}")
    return normalize_color(j.get("libCouleur")) if j.get("libCouleur") else code_to_color(j.get("codeJour"))

def fetch_primary_stats():
    s = _requests_get_json("https://www.api-couleur-tempo.fr/api/stats")
    return {
        "periode": s.get("periode"),
        "bleu_used": s.get("joursBleusConsommes"),
        "blanc_used": s.get("joursBlancsConsommes"),
        "rouge_used": s.get("joursRougesConsommes"),
        "bleu_left": s.get("joursBleusRestants"),
        "blanc_left": s.get("joursBlancsRestants"),
        "rouge_left": s.get("joursRougesRestants"),
        "last_included": s.get("dernierJourInclus"),
        "bissextile": s.get("bissextile"),
    }

def _fmt_no_leading_zeros(dt: date) -> str:
    return f"{dt.year}-{dt.month}-{dt.day}"

def fetch_edf_fallback():
    now = datetime.now().date()
    inf = now - timedelta(days=364)
    sup = now + timedelta(days=2)
    url = (
        "https://api-commerce.edf.fr/commerce/activet/v1/calendrier-jours-effacement"
        f"?option=TEMPO&dateApplicationBorneInf={_fmt_no_leading_zeros(inf)}"
        f"&dateApplicationBorneSup={_fmt_no_leading_zeros(sup)}"
        "&identifiantConsommateur=src"
    )
    j = _requests_get_json(url, timeout=10)
    jours = j.get("content") or j.get("jours") or j.get("data") or []
    by_date = {}
    for it in jours:
        dj = it.get("dateApplication") or it.get("dateJour") or it.get("date") or it.get("dateApp")
        cc = it.get("codeJour") or it.get("typeJourEffacement") or it.get("code") or it.get("couleur")
        if dj:
            by_date[str(dj)[:10]] = code_to_color(cc) if str(cc).isdigit() else normalize_color(cc)
    today = by_date.get(now.isoformat(), "UNKNOWN")
    tomorrow = by_date.get((now + timedelta(days=1)).isoformat(), "UNKNOWN")
    return today, tomorrow

class TempoState:
    def __init__(self):
        self.lock = threading.Lock()
        self.today = "UNKNOWN"
        self.tomorrow = "UNKNOWN"
        self.yesterday = "UNKNOWN"
        self.stats = {}
        self.last_update = 0.0
        self.last_error = ""

    def to_dict(self):
        with self.lock:
            return {
                "today": self.today,
                "tomorrow": self.tomorrow,
                "yesterday": self.yesterday,
                "stats": self.stats,
                "updated_at": int(self.last_update),
                "last_error": self.last_error,
            }

    def load_cache(self):
        try:
            if os.path.exists(CACHE_FILE):
                with open(CACHE_FILE, "r", encoding="utf-8") as f:
                    j = json.load(f)
                with self.lock:
                    self.today = j.get("today", self.today)
                    self.tomorrow = j.get("tomorrow", self.tomorrow)
                    self.yesterday = j.get("yesterday", self.yesterday)
                    self.stats = j.get("stats", self.stats) or {}
                    self.last_update = float(j.get("updated_at", self.last_update) or 0)
                    self.last_error = j.get("last_error", self.last_error) or ""
        except Exception:
            pass

    def save_cache(self):
        try:
            d = self.to_dict()
            with open(CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump(d, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    def refresh(self):
        err = []
        # today/tomorrow
        today = tomorrow = "UNKNOWN"
        try:
            today, tomorrow = fetch_primary()
        except Exception as e:
            err.append(f"primary failed: {e}")
            try:
                today, tomorrow = fetch_edf_fallback()
            except Exception as e2:
                err.append(f"edf failed: {e2}")

        # yesterday
        yesterday = "UNKNOWN"
        try:
            yesterday = fetch_primary_yesterday()
        except Exception as e:
            err.append(f"yesterday failed: {e}")
            # best effort: yesterday = cached today
            try:
                if os.path.exists(CACHE_FILE):
                    with open(CACHE_FILE, "r", encoding="utf-8") as f:
                        j = json.load(f)
                    yesterday = j.get("today", "UNKNOWN")
            except Exception:
                pass

        # stats
        stats = {}
        try:
            stats = fetch_primary_stats()
        except Exception as e:
            err.append(f"stats failed: {e}")

        with self.lock:
            self.today = today
            self.tomorrow = tomorrow
            self.yesterday = yesterday
            self.stats = stats
            self.last_error = " | ".join(err)
            self.last_update = time.time()
        self.save_cache()

class Handler(BaseHTTPRequestHandler):
    state: TempoState = None

    def _send_json(self, payload, code=200):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = urlparse(self.path).path
        if path in ("/tempo", "/tempo/"):
            self._send_json(self.state.to_dict(), 200)
            return
        if path in ("/stats", "/stats/"):
            self._send_json(self.state.to_dict().get("stats", {}), 200)
            return
        if path in ("/health", "/health/"):
            self._send_json({"ok": True}, 200)
            return
        self._send_json({"error": "not found"}, 404)

    def log_message(self, format, *args):
        return

def start_server(state: TempoState, host: str, port: int):
    Handler.state = state
    httpd = HTTPServer((host, port), Handler)
    print(f"[TempoHelper] Server running on http://{host}:{port}/tempo")
    httpd.serve_forever()

def start_refresher(state: TempoState, interval: int):
    while True:
        try:
            state.refresh()
        except Exception as e:
            with state.lock:
                state.last_error = f"refresh crashed: {e}"
                state.last_update = time.time()
            state.save_cache()
        time.sleep(max(60, interval))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=9123)
    ap.add_argument("--interval", type=int, default=1800)
    args = ap.parse_args()

    state = TempoState()
    state.load_cache()
    state.refresh()

    threading.Thread(target=start_refresher, args=(state, args.interval), daemon=True).start()
    start_server(state, args.host, args.port)

if __name__ == "__main__":
    main()
