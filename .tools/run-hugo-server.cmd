@echo off
cd /d C:\Users\Samjo\OneDrive\Documents\GitHub\samsdayzobjectfinder
".tools\hugo-0.128.0\hugo.exe" server --bind 127.0.0.1 --port 1314 --baseURL http://127.0.0.1:1314/ > ".tools\hugo-server.log" 2> ".tools\hugo-server.err.log"
