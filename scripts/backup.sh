#!/bin/bash
# Automated Git Backup Script
# Run this manually or set up as a cron job

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔄 Starting automated backup...${NC}"

# Get current directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Check if we're in a git repo
if [ ! -d ".git" ]; then
    echo -e "${YELLOW}⚠️  Not a git repository. Initializing...${NC}"
    git init
fi

# Add all changes
echo -e "${BLUE}📦 Adding changes...${NC}"
git add -A

# Check if there are changes to commit
if git diff --staged --quiet; then
    echo -e "${YELLOW}ℹ️  No changes to commit${NC}"
else
    # Create commit with timestamp
    TIMESTAMP=$(date +'%Y-%m-%d %H:%M:%S')
    git commit -m "Auto-backup: $TIMESTAMP"
    echo -e "${GREEN}✅ Changes committed${NC}"
fi

# Push to remote if it exists
if git remote | grep -q 'origin'; then
    echo -e "${BLUE}⬆️  Pushing to GitHub...${NC}"
    BRANCH=$(git rev-parse --abbrev-ref HEAD)
    git push origin "$BRANCH" || echo -e "${YELLOW}⚠️  Push failed (may need to set upstream)${NC}"
    echo -e "${GREEN}✅ Pushed to GitHub${NC}"
else
    echo -e "${YELLOW}⚠️  No remote repository configured${NC}"
    echo -e "${YELLOW}   Run: gh repo create asteroids-game --public --source=. --push${NC}"
fi

# Create local backup archive
BACKUP_DIR="$HOME/Backups/Asteroids"
mkdir -p "$BACKUP_DIR"
DATE=$(date +'%Y-%m-%d')
BACKUP_FILE="$BACKUP_DIR/asteroids-backup-$DATE.tar.gz"

echo -e "${BLUE}📦 Creating local backup archive...${NC}"
tar -czf "$BACKUP_FILE" \
    --exclude=node_modules \
    --exclude=dist \
    --exclude=.git \
    --exclude=.vercel \
    .

echo -e "${GREEN}✅ Backup saved to: $BACKUP_FILE${NC}"
echo -e "${GREEN}🎉 Backup complete!${NC}"
