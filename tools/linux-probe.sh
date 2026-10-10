#!/usr/bin/env bash
# linux-probe.sh —— Linux/SteamOS/Bazzite 只读"体检"脚本（不修改任何文件、不安装任何东西）
# 用途：确认 Steam 安装形态与真实路径、账号目录、可用命令、FUSE/中文字体等，便于排障（见 维护约定 §18）。
# 用法：bash tools/linux-probe.sh    （或 chmod +x 后 ./tools/linux-probe.sh）

echo "===== 1. 系统 ====="
grep -E '^(NAME|VERSION|ID|VARIANT|PRETTY_NAME)=' /etc/os-release 2>/dev/null
uname -m
ldd --version 2>/dev/null | head -1

echo "===== 2. 桌面会话 ====="
echo "session=$XDG_SESSION_TYPE  desktop=$XDG_CURRENT_DESKTOP"
(plasmashell --version 2>/dev/null || gnome-shell --version 2>/dev/null || echo "桌面未知")

echo "===== 3. Steam 是哪种形态 ====="
echo "which steam : $(command -v steam || echo '(无)')"
echo "rpm steam   : $(rpm -q steam 2>/dev/null || echo '(无/不是rpm)')"
echo "flatpak     :"; flatpak list --app 2>/dev/null | grep -i steam || echo "  (无 flatpak 或无 steam)"
echo "ostree      :"; rpm-ostree status --booted 2>/dev/null | head -4 || echo "  (无 rpm-ostree)"

echo "===== 4. Steam 目录（哪个存在就是哪个） ====="
for d in "$HOME/.steam/steam" "$HOME/.steam/root" "$HOME/.local/share/Steam" \
         "$HOME/.var/app/com.valvesoftware.Steam/.local/share/Steam" \
         "$HOME/.var/app/com.valvesoftware.Steam/.steam/steam" \
         "$HOME/snap/steam/common/.local/share/Steam"; do
  [ -e "$d" ] && echo "存在: $d  ->  $(readlink -f "$d")"
done

echo "===== 5. userdata / 账号 / 关键文件 ====="
for r in "$HOME/.steam/steam" "$HOME/.local/share/Steam" \
         "$HOME/.var/app/com.valvesoftware.Steam/.local/share/Steam" \
         "$HOME/snap/steam/common/.local/share/Steam"; do
  if [ -d "$r/userdata" ]; then
    echo "[$r]"
    echo "  账号目录: $(ls "$r/userdata" 2>/dev/null | tr '\n' ' ')"
    echo "  grid:     $(ls "$r/userdata"/*/config/grid 2>/dev/null | head -3 | tr '\n' ' ')..."
    echo "  loginusers.vdf: $([ -f "$r/config/loginusers.vdf" ] && echo 有 || echo 无)   appinfo.vdf: $([ -f "$r/appcache/appinfo.vdf" ] && echo 有 || echo 无)"
  fi
done

echo "===== 6. 进程 / 工具 ====="
pgrep -x steam >/dev/null && echo "steam 运行: 是" || echo "steam 运行: 否"
for c in pgrep zenity kdialog curl gio xdg-mime update-desktop-database update-mime-database fc-list fusermount3 flatpak; do
  printf "  %-22s %s\n" "$c" "$(command -v "$c" || echo '(无)')"
done

echo "===== 7. FUSE / 中文字体 / 家目录 ====="
ls -l /dev/fuse 2>/dev/null || echo "/dev/fuse (无)"
fc-list :lang=zh 2>/dev/null | head -3 || echo "fc-list 不可用"
echo "HOME=$HOME"
