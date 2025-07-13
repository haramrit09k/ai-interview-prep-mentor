#!/bin/bash

# This script starts the frontend and backend in separate terminal windows.

# Determine OS
OS="$(uname -s)"

# Function to open a new terminal and run a command
open_new_terminal() {
  local command_to_run="$1"
  local title="$2"

  case "$OS" in
    Linux*|CYGWIN*|MSYS*)
      # Assume gnome-terminal or compatible for Linux/WSL
      gnome-terminal --tab --title="$title" -- bash -c "$command_to_run; exec bash"
      ;;
    Darwin*)
      # macOS
      osascript -e 'tell application "Terminal" to do script "cd \"'$(pwd)'\"; '"$command_to_run"'"' -e 'tell application "Terminal" to set custom title of front window to "'"$title"'"'
      ;;
    *)
      echo "Unsupported OS: $OS. Please open two terminals manually and run the commands."
      echo "Terminal 1 (Backend): node server/index.js"
      echo "Terminal 2 (Frontend): npm run dev"
      exit 1
      ;;
  esac
}

# Start Backend
echo "Starting backend..."
open_new_terminal "node server/index.js" "Backend Server"

# Start Frontend
echo "Starting frontend..."
open_new_terminal "npm run dev" "Frontend Dev Server"

echo "Development servers are starting in new terminal windows."
