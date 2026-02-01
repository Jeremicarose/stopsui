#!/bin/bash

# Auto-commit and push script for StopSui
# Runs continuously, checking for changes every 5 minutes
# Generates meaningful commit messages based on what changed

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_FILE="$REPO_ROOT/logs/auto-commit.log"
INTERVAL=300  # 5 minutes in seconds

# Ensure log directory exists
mkdir -p "$REPO_ROOT/logs"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

generate_commit_message() {
    local added_files=$(git diff --cached --name-only --diff-filter=A)
    local modified_files=$(git diff --cached --name-only --diff-filter=M)
    local deleted_files=$(git diff --cached --name-only --diff-filter=D)

    local message=""
    local emoji=""

    # Determine primary action and emoji
    if [[ -n "$added_files" ]]; then
        # Check what kind of files were added
        if echo "$added_files" | grep -q "^contracts/"; then
            if echo "$added_files" | grep -q "\.move$"; then
                emoji="🔷"
                message="Add Move contract"
            else
                emoji="📜"
                message="Add contract config"
            fi
        elif echo "$added_files" | grep -q "^frontend/"; then
            emoji="🖥️"
            message="Add frontend"
        elif echo "$added_files" | grep -q "^keeper/"; then
            emoji="🤖"
            message="Add keeper bot"
        elif echo "$added_files" | grep -q "^scripts/"; then
            emoji="⚙️"
            message="Add scripts"
        elif echo "$added_files" | grep -q "test"; then
            emoji="🧪"
            message="Add tests"
        elif echo "$added_files" | grep -q "\.move$"; then
            emoji="🔷"
            message="Add Move module"
        elif echo "$added_files" | grep -q "\.tsx\?$"; then
            emoji="⚛️"
            message="Add React component"
        elif echo "$added_files" | grep -q "\.ts$"; then
            emoji="📘"
            message="Add TypeScript"
        else
            emoji="📝"
            message="Add files"
        fi
    elif [[ -n "$modified_files" ]]; then
        if echo "$modified_files" | grep -q "^contracts/"; then
            if echo "$modified_files" | grep -q "\.move$"; then
                emoji="🔷"
                message="Update Move contract"
            else
                emoji="📜"
                message="Update contract config"
            fi
        elif echo "$modified_files" | grep -q "^frontend/"; then
            emoji="🖥️"
            message="Update frontend"
        elif echo "$modified_files" | grep -q "^keeper/"; then
            emoji="🤖"
            message="Update keeper bot"
        elif echo "$modified_files" | grep -q "package"; then
            emoji="📦"
            message="Update dependencies"
        elif echo "$modified_files" | grep -q "\.move$"; then
            emoji="🔷"
            message="Update Move module"
        elif echo "$modified_files" | grep -q "\.tsx\?$"; then
            emoji="⚛️"
            message="Update React component"
        elif echo "$modified_files" | grep -q "\.ts$"; then
            emoji="📘"
            message="Update TypeScript"
        else
            emoji="🔧"
            message="Update"
        fi
    elif [[ -n "$deleted_files" ]]; then
        emoji="🗑️"
        message="Remove unused files"
    else
        emoji="🔧"
        message="Update"
    fi

    # Add specifics
    local file_count=$(git diff --cached --name-only | wc -l | xargs)
    local primary_file=$(git diff --cached --name-only | head -1 | xargs basename 2>/dev/null || echo "")

    if [[ $file_count -eq 1 && -n "$primary_file" ]]; then
        echo "$emoji $message: $primary_file"
    elif [[ $file_count -le 3 ]]; then
        local files=$(git diff --cached --name-only | xargs -I{} basename {} | tr '\n' ', ' | sed 's/,$//')
        echo "$emoji $message: $files"
    else
        echo "$emoji $message ($file_count files)"
    fi
}

do_commit() {
    cd "$REPO_ROOT" || { log "❌ Failed to navigate to repo root"; return 1; }

    # Check if there are any changes
    if [[ -z $(git status -s) ]]; then
        return 0  # No changes, silent return
    fi

    log "📝 Changes detected:"
    git status -s >> "$LOG_FILE"

    # Stage all changes
    git add .

    # Generate commit message
    local commit_msg=$(generate_commit_message)

    log "💬 Commit message: $commit_msg"

    # Create commit
    git commit -m "$commit_msg"

    # Push to GitHub
    log "🚀 Pushing to GitHub..."
    if git push origin main 2>&1 | tee -a "$LOG_FILE"; then
        log "✅ Committed and pushed successfully!"
    else
        log "❌ Failed to push to GitHub"
        return 1
    fi
}

# Main execution
case "${1:-}" in
    --once)
        # Single run mode
        log "Running single commit check..."
        do_commit
        ;;
    --watch|"")
        # Continuous watch mode (default)
        log "🚀 StopSui auto-commit started (checking every 5 minutes)"
        log "   Press Ctrl+C to stop"

        while true; do
            do_commit
            sleep $INTERVAL
        done
        ;;
    --help)
        echo "Usage: $0 [--once|--watch|--help]"
        echo "  --once   Run once and exit"
        echo "  --watch  Run continuously every 5 minutes (default)"
        echo "  --help   Show this help"
        ;;
    *)
        echo "Unknown option: $1"
        echo "Use --help for usage"
        exit 1
        ;;
esac
