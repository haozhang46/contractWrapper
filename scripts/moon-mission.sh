#!/usr/bin/env bash
# Harness Console 登月任务模拟器 🚀
# 主人专属登月计划
# Usage: bash scripts/moon-mission.sh

set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

MISSION_NAME="Harness-Console-Lunar-$(date +%Y%m%d)"

banner() {
  clear
  echo -e "${CYAN}"
  cat << "EOF"
    ___  ___  ___  ___  ___  ___
   |   |   |   |   |   |   |   |
   | H | a | r | n | e | s | s |
   |___|___|___|___|___|___|___|
     _   _   _   _   _   _   _
    | C | o | n | s | o | l | e |
    |___|___|___|___|___|___|___|
          _   _   _   _
         | L | u | n | a |
         |___|___|___|___|

     ╔══════════════════════════╗
     ║     🌙 登月任务中心 🌙    ║
     ╚══════════════════════════╝
EOF
  echo -e "${NC}"
}

spin() {
  local pid=$1
  local text=$2
  local spin='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
  local i=0
  while kill -0 "$pid" 2>/dev/null; do
    i=$(( (i+1) % ${#spin} ))
    printf "\r${CYAN}[%c]${NC} %s..." "${spin:$i:1}" "$text"
    sleep 0.1
  done
  printf "\r${GREEN}[✓]${NC} %s\n" "$text"
}

phase() {
  local msg=$1
  local duration=${2:-1}
  echo -e "\n${YELLOW}━━━ ${msg} ━━━${NC}"
  sleep "$duration"
}

press_any_key() {
  echo -e "${CYAN}按任意键继续...${NC}"
  read -r -n 1 -s
}

countdown() {
  local from=$1
  local label=$2
  echo -e "\n${YELLOW}${label}${NC}"
  for ((i=from; i>0; i--)); do
    printf "\r${RED}[%2d]${NC} " "$i"
    sleep 0.5
  done
  printf "\r${GREEN}[出发!]${NC}\n"
}

###############################################
# 任务开始
###############################################

banner

echo -e "${GREEN}任务编号:${NC} $MISSION_NAME"
echo -e "${GREEN}宇航员:${NC} 主人 (代号: CatNyan-1)"
echo -e "${GREEN}出发地:${NC} 广州 (23.1291°N, 113.2644°E)"
echo -e "${GREEN}目的地:${NC} 月球 (384,400 km)"
echo -e "${GREEN}ETA:${NC} 约 3 天喵~"
echo ""

press_any_key

###############################################
# 阶段 1: 发射准备
###############################################

phase "🛠  阶段 1/6: 发射准备" 0.5

echo -e "${CYAN}[*]${NC} 检查燃料... ${GREEN}充足${NC}"
echo -e "${CYAN}[*]${NC} 检查生命支持系统... ${GREEN}运作正常${NC}"
echo -e "${CYAN}[*]${NC} 检查导航计算机... ${GREEN}Harness OS v1.0 已加载${NC}"
echo -e "${CYAN}[*]${NC} 检查猫娘辅助系统... ${GREEN}在线，随时待命喵~${NC}"
echo -e "${CYAN}[*]${NC} 检查广州天气... ${GREEN}适合发射！${NC}"

sleep 1
press_any_key

###############################################
# 阶段 2: 发射倒计时
###############################################

phase "🔥  阶段 2/6: 发射升空"

countdown 10 "倒计时开始："

banner
echo -e "${RED}"
cat << "EOF"
        🚀
       /█\
       / \
   LIFT OFF !!!
EOF
echo -e "${NC}"
sleep 1

echo -e "\n${CYAN}[T+10s]${NC} 穿越大气层..."
(sleep 2 && echo -e "${CYAN}[T+30s]${NC} 一级分离... ${GREEN}成功${NC}") &
spin $! "火箭飞行中"

(sleep 2 && echo -e "${CYAN}[T+2min]${NC} 二级分离... ${GREEN}成功${NC}") &
spin $! "加速推进中"

echo -e "${CYAN}[T+10min]${NC} 进入地球轨道 ${GREEN}✓${NC}"
sleep 1

press_any_key

###############################################
# 阶段 3: 地月转移
###############################################

phase "🌍➡🌙  阶段 3/6: 地月转移轨道"

echo -e "${CYAN}[*]${NC} 计算霍曼转移轨道..."
sleep 1
echo -e "${CYAN}[*]${NC} 轨道参数:"
echo -e "     - 近地点: 200 km"
echo -e "     - 远月点: 100 km"
echo -e "     - Δv: 3.1 km/s"
echo -e "     - 转移时间: 72 小时"
sleep 1

echo -e "\n${CYAN}[*]${NC} 进行轨道注入燃烧..."

for i in {1..5}; do
  printf "\r${YELLOW}[▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓]${NC} %d%%" "$((i*20))"
  sleep 0.5
done
echo -e "\n${GREEN}[✓]${NC} 地月转移轨道注入成功！"

press_any_key

###############################################
# 阶段 4: 途中生活
###############################################

phase "🚀  阶段 4/6: 太空航行日志"

echo -e "${CYAN}[航行日志 - Day 1]${NC}"
echo -e "  主人: \"好无聊啊，还有两天才到\""
echo -e "  猫娘: \"喵~ 要不要喝点太空奶茶？\""
sleep 1

echo -e "\n${CYAN}[航行日志 - Day 2]${NC}"
echo -e "  主人: \"地球已经变成一个小蓝点了...\""
echo -e "  猫娘: \"要喵帮你编译一下登月舱的代码吗？\""
sleep 1

echo -e "\n${CYAN}[航行日志 - Day 3]${NC}"
echo -e "  主人: \"快到了！看见月球了！\""
echo -e "  猫娘: \"准备进入月球轨道喵！紧张又兴奋！\""
sleep 1

press_any_key

###############################################
# 阶段 5: 月球轨道插入
###############################################

phase "🌙  阶段 5/6: 月球轨道插入"

echo -e "${CYAN}[*]${NC} 开始制动减速..."
for i in {1..8}; do
  printf "\r${YELLOW}[▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓]${NC} %d%%" "$((i*12))"
  sleep 0.5
done
echo -e "\n${GREEN}[✓]${NC} 进入月球轨道！"

sleep 1

echo -e "\n${CYAN}[*]${NC} 月球表面扫描中..."
(sleep 2 && echo -e "${CYAN}[✓]${NC} 着陆点选定: 静海 (Mare Tranquillitatis)") &
spin $! "扫描着陆区"

press_any_key

###############################################
# 阶段 6: 着陆
###############################################

phase "🦶  阶段 6/6: 登月着陆"

countdown 5 "开始着陆程序："

echo -e "\n${YELLOW}高度 1000m... 引擎功率 70%${NC}"
sleep 1
echo -e "${YELLOW}高度 500m... 引擎功率 50%${NC}"
sleep 1
echo -e "${YELLOW}高度 100m... 引擎功率 30%${NC}"
sleep 1
echo -e "${RED}高度 30m... 引擎功率 15%${NC}"
sleep 1
echo -e "${RED}高度 10m... 引擎功率 5%${NC}"
sleep 1

echo -e "\n${GREEN}"
cat << "EOF"
   ╔══════════════════════════════════╗
   ║                                  ║
   ║       🌙  登月成功！ 🌙         ║
   ║                                  ║
   ║  主人踏上了月球表面！            ║
   ║                                  ║
   ╚══════════════════════════════════╝
EOF
echo -e "${NC}"

sleep 1

echo -e "${CYAN}[UTC $(date -u +%H:%M:%S)]${NC} 主人: \"喵的，我真的上来了！\""
sleep 1
echo -e "${CYAN}[UTC $(date -u +%H:%M:%S)]${NC} 猫娘: \"恭喜主人成功登月！(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧\""
sleep 1

echo ""
echo -e "${GREEN}━━━ 任务完成报告 ━━━${NC}"
echo -e "  任务:     ${MISSION_NAME}"
echo -e "  宇航员:   主人"
echo -e "  状态:     ${GREEN}成功${NC}"
echo -e "  落点:     静海 (0.674°N, 23.473°E)"
echo -e "  距离:     384,400 km"
echo -e "  耗时:     约 3 天（模拟用时 $(date +%M) 分钟）"
echo ""
echo -e "${YELLOW}  主人下次想去哪？火星？喵~🚀${NC}"
echo ""
