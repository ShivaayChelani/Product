#!/usr/bin/env python3
import subprocess
import sys

pkgs = ["leaflet", "react-leaflet", "osrm"]
for pkg in pkgs:
    print(f"Installing {pkg}...")
    result = subprocess.run(
        [sys.executable, "-m", "pip", "install", pkg, "--legacy-peer-deps"],
        capture_output=True, text=True,
        cwd="D:/PalSafar"
    )
    print(f"  stdout: {result.stdout[-200:] if result.stdout else ''}")
    print(f"  stderr: {result.stderr[-200:] if result.stderr else ''}")
    print(f"  returncode: {result.returncode}")
    if result.returncode != 0:
        print(f"FAILED to install {pkg}")
    else:
        print(f"SUCCESS: {pkg} installed")