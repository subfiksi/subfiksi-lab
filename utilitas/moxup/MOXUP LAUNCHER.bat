@echo off
rem Klik dua kali file ini untuk membuka MOXUP. Tidak perlu memasang apa pun.
title MOXUP
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
if errorlevel 1 pause
