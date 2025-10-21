# 🚀 Quick Reference Card

## 📦 Your Project URLs

- **GitHub:** https://github.com/mikehelm/asteroids-game
- **Live Game:** https://asteroids-8to6fkpwn-mikehelm-gmailcoms-projects.vercel.app
- **Vercel Dashboard:** https://vercel.com/mikehelm-gmailcoms-projects/asteroids

---

## ⚡ Common Commands

### **Save Your Work:**
```bash
git add .
git commit -m "What you changed"
git push
```

### **Quick Backup:**
```bash
./scripts/backup.sh
```

### **Deploy:**
```bash
vercel --prod
```

### **Run Locally:**
```bash
npm run dev
# Open: http://localhost:4000
```

### **Build:**
```bash
npm run build
```

---

## 📁 Important Files

- `src/Game.tsx` - Main game logic
- `src/components/VirtualJoystick.tsx` - Mobile joystick
- `src/components/TouchControls.tsx` - Mobile buttons
- `scripts/backup.sh` - Backup script
- `GIT_SETUP.md` - Full Git guide
- `MOBILE_CONTROLS.md` - Touch controls docs

---

## 🔄 Workflow

1. **Make changes** in your code
2. **Test locally:** `npm run dev`
3. **Save to Git:** `git add . && git commit -m "message" && git push`
4. **Deploy:** `vercel --prod` (or auto-deploy if connected)

---

## 💾 Backups

- **GitHub:** Every push = automatic backup
- **Local:** Run `./scripts/backup.sh`
- **Location:** `~/Backups/Asteroids/`

---

## 🆘 Emergency

### **Restore from GitHub:**
```bash
git clone https://github.com/mikehelm/asteroids-game.git
cd asteroids-game
npm install
npm run dev
```

### **Undo Last Commit:**
```bash
git reset --soft HEAD~1
```

### **Discard All Changes:**
```bash
git checkout .
```

---

## 📞 Help

- **Git issues:** See `GIT_SETUP.md`
- **Mobile controls:** See `MOBILE_CONTROLS.md`
- **Backup info:** See `BACKUP_SUMMARY.md`
