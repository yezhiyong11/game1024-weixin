let canvas = null
let ctx = null
let grid = []
let tiles = []
let score = 0
let totalScore = 0
let gameOver = false
let gameWon = false
let size = 4
let level = 1
let targetScore = 4
let reviveCount = 3
let isChallengeMode = false
let challengeTarget = 0
let currentChallengeId = null
let startX = 0
let startY = 0
let currentTab = 'home'
let touchTarget = null
let rankingSort = 'score' // 'score' or 'level'

const challengeLevels = [
  { id: 'easy', name: '初级挑战', target: 1024, state: 'locked' },
  { id: 'medium', name: '中级挑战', target: 2048, state: 'locked' },
  { id: 'hard', name: '高级挑战', target: 4096, state: 'locked' },
  { id: 'master', name: '大师级挑战', target: 8192, state: 'locked' }
]

function init() {
  canvas = wx.createCanvas()
  ctx = canvas.getContext('2d')
  
  const systemInfo = wx.getSystemInfoSync()
  canvas.width = systemInfo.windowWidth
  canvas.height = systemInfo.windowHeight
  
  getUserInfo(function() {
    loadGameData()
    newGame()
    saveGameData()
    draw()
  })
  
  wx.onTouchStart(touchStart)
  wx.onTouchEnd(touchEnd)
}

function getUserInfo(callback) {
  try {
    const savedUserInfo = wx.getStorageSync('userInfo')
    if (savedUserInfo && savedUserInfo.weixinId && savedUserInfo.weixinName) {
      const gameData = wx.getStorageSync('game1024_data') || {}
      gameData.weixinId = savedUserInfo.weixinId
      gameData.weixinName = savedUserInfo.weixinName
      wx.setStorageSync('game1024_data', gameData)
      if (callback) callback()
      return
    }
    
    wx.login({
      success: function(loginRes) {
        const code = loginRes.code || 'guest_' + Date.now()
        
        try {
          const userInfoButton = wx.createUserInfoButton({
            type: 'text',
            text: '点击获取微信昵称',
            style: {
              left: canvas.width / 2 - 70,
              top: canvas.height / 2 + 150,
              width: 140,
              height: 36,
              backgroundColor: '#edc22e',
              color: '#8f7a66',
              textAlign: 'center',
              lineHeight: 36,
              fontSize: 14,
              borderRadius: 6
            }
          })
          
          userInfoButton.onTap((res) => {
            let weixinName = '玩家' + Math.floor(Math.random() * 10000)
            if (res && res.userInfo && res.userInfo.nickName) {
              weixinName = res.userInfo.nickName
            }
            
            const userInfoData = {
              weixinId: 'user_' + code,
              weixinName: weixinName
            }
            wx.setStorageSync('userInfo', userInfoData)
            
            const gameData = wx.getStorageSync('game1024_data') || {}
            gameData.weixinId = userInfoData.weixinId
            gameData.weixinName = weixinName
            wx.setStorageSync('game1024_data', gameData)
            
            userInfoButton.destroy()
            
            if (callback) callback()
          })
        } catch (e) {
          const weixinName = '玩家' + Math.floor(Math.random() * 10000)
          const userInfoData = {
            weixinId: 'user_' + code,
            weixinName: weixinName
          }
          wx.setStorageSync('userInfo', userInfoData)
          
          const gameData = wx.getStorageSync('game1024_data') || {}
          gameData.weixinId = userInfoData.weixinId
          gameData.weixinName = weixinName
          wx.setStorageSync('game1024_data', gameData)
          
          if (callback) callback()
        }
      },
      fail: function() {
        const weixinId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
        const weixinName = '玩家' + Math.floor(Math.random() * 10000)
        
        const userInfoData = {
          weixinId: weixinId,
          weixinName: weixinName
        }
        wx.setStorageSync('userInfo', userInfoData)
        
        const gameData = wx.getStorageSync('game1024_data') || {}
        gameData.weixinId = weixinId
        gameData.weixinName = weixinName
        wx.setStorageSync('game1024_data', gameData)
        
        if (callback) callback()
      }
    })
  } catch (e) {
    const weixinId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    const weixinName = '游客'
    
    const userInfoData = {
      weixinId: weixinId,
      weixinName: weixinName
    }
    wx.setStorageSync('userInfo', userInfoData)
    
    const gameData = wx.getStorageSync('game1024_data') || {}
    gameData.weixinId = weixinId
    gameData.weixinName = weixinName
    wx.setStorageSync('game1024_data', gameData)
    
    if (callback) callback()
  }
}

function loadGameData() {
  try {
    const numberToState = (num) => {
      if (num === 0) return 'locked'
      if (num === 1) return 'available'
      if (num === 2) return 'completed'
      return 'locked'
    }
    
    const data = wx.getStorageSync('game1024_data')
    if (data) {
      score = data.score || (level <= 8 ? 2 : 4)
      totalScore = data.totalScore || 0
      level = data.level || 1
      challengeLevels[0].state = numberToState(data.challenge1024)
      challengeLevels[1].state = numberToState(data.challenge2048)
      challengeLevels[2].state = numberToState(data.challenge4096)
      challengeLevels[3].state = numberToState(data.challenge8192)
    }
    
    if (level >= 5 && challengeLevels[0].state !== 'completed') {
      challengeLevels[0].state = 'available'
    }
    if (level >= 8 && challengeLevels[1].state !== 'completed') {
      challengeLevels[1].state = 'available'
    }
    if (level >= 10 && challengeLevels[2].state !== 'completed') {
      challengeLevels[2].state = 'available'
    }
    if (totalScore >= 100 && challengeLevels[3].state !== 'completed') {
      challengeLevels[3].state = 'available'
    }
  } catch (e) {
  }
}

function saveGameData() {
  try {
    const stateToNumber = (state) => {
      if (state === 'locked') return 0
      if (state === 'available') return 1
      if (state === 'completed') return 2
      return 0
    }
    
    const userInfo = wx.getStorageSync('userInfo') || {}
    const weixinId = userInfo.weixinId || 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    const weixinName = userInfo.weixinName || '游客'
    
    wx.setStorageSync('game1024_data', {
      weixinId: weixinId,
      weixinName: weixinName,
      score: score,
      totalScore: totalScore,
      level: level,
      challenge1024: stateToNumber(challengeLevels[0].state),
      challenge2048: stateToNumber(challengeLevels[1].state),
      challenge4096: stateToNumber(challengeLevels[2].state),
      challenge8192: stateToNumber(challengeLevels[3].state)
    })
    
    const records = loadRankingData()
    const existingIndex = records.findIndex(r => r.weixinId === weixinId)
    
    if (existingIndex !== -1) {
      records[existingIndex] = {
        weixinId: weixinId,
        weixinName: weixinName,
        totalScore: totalScore,
        level: level
      }
    } else {
      records.push({
        weixinId: weixinId,
        weixinName: weixinName,
        totalScore: totalScore,
        level: level
      })
    }
    
    records.sort((a, b) => b.totalScore - a.totalScore)
    const topRecords = records.slice(0, 10)
    saveRankingData(topRecords)
  } catch (e) {
  }
}

function newGame() {
  grid = Array(size * size).fill(0)
  tiles = []
  score = isChallengeMode ? 10 : (level <= 8 ? 2 : 4)
  gameOver = false
  gameWon = false
  
  if (!isChallengeMode) {
    if (level <= 8) {
      targetScore = Math.pow(2, level + 1)
    } else {
      targetScore = 1024
    }
  }
  
  addRandomTile()
  addRandomTile()
  draw()
}

function addRandomTile() {
  const emptyCells = []
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === 0) {
      emptyCells.push(i)
    }
  }
  
  if (emptyCells.length > 0) {
    const randomIndex = emptyCells[Math.floor(Math.random() * emptyCells.length)]
    const value = getRandomValue()
    grid[randomIndex] = value
    tiles.push({
      value: value,
      row: Math.floor(randomIndex / size),
      col: randomIndex % size,
      isNew: true
    })
  }
}

function getRandomValue() {
  if (level <= 10) {
    return 2
  } else {
    return Math.random() < 0.9 ? 2 : 4
  }
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

function draw() {
  ctx.fillStyle = '#faf8ef'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  
  if (currentTab === 'ranking') {
    drawRanking()
    drawTabBar()
    return
  }
  
  if (currentTab === 'challenge' && !isChallengeMode) {
    drawChallenge()
    drawTabBar()
    return
  }
  
  const cellSize = Math.min(canvas.width - 40, canvas.height - 360) / size
  const padding = 10
  const offsetX = (canvas.width - (size * cellSize + (size - 1) * padding)) / 2
  const offsetY = 220
  
  ctx.fillStyle = '#8f7a66'
  ctx.font = 'bold 48px Arial'
  ctx.textAlign = 'center'
  ctx.fillText('1024', canvas.width / 2, 45)
  
  let levelText = ''
  if (isChallengeMode && currentChallengeId) {
    const challenge = challengeLevels.find(c => c.id === currentChallengeId)
    levelText = challenge ? challenge.name : `挑战目标: ${challengeTarget}`
  } else {
    levelText = `第 ${level} 关`
  }
  ctx.font = '22px Arial'
  ctx.fillStyle = '#8f7a66'
  ctx.fillText(levelText, canvas.width / 2, 85)
  
  ctx.font = '18px Arial'
  ctx.fillText(`目标: ${targetScore}`, canvas.width / 2, 115)
  
  const scoreBoxWidth = 100
  const scoreBoxHeight = 55
  const scoreBoxGap = 20
  const totalScoreBoxWidth = scoreBoxWidth * 2 + scoreBoxGap
  const scoreStartX = (canvas.width - totalScoreBoxWidth) / 2
  const scoreY = 125
  
  ctx.fillStyle = '#bbada0'
  drawRoundedRect(ctx, scoreStartX, scoreY, scoreBoxWidth, scoreBoxHeight, 6)
  ctx.fill()
  ctx.fillStyle = '#f9f6f2'
  ctx.font = 'bold 16px Arial'
  ctx.fillText('分数', scoreStartX + scoreBoxWidth / 2, scoreY + 18)
  ctx.font = 'bold 24px Arial'
  ctx.fillText(score, scoreStartX + scoreBoxWidth / 2, scoreY + 43)
  
  ctx.fillStyle = '#bbada0'
  drawRoundedRect(ctx, scoreStartX + scoreBoxWidth + scoreBoxGap, scoreY, scoreBoxWidth, scoreBoxHeight, 6)
  ctx.fill()
  ctx.fillStyle = '#f9f6f2'
  ctx.font = 'bold 16px Arial'
  ctx.fillText('总分', scoreStartX + scoreBoxWidth + scoreBoxGap + scoreBoxWidth / 2, scoreY + 18)
  ctx.font = 'bold 24px Arial'
  ctx.fillText(totalScore, scoreStartX + scoreBoxWidth + scoreBoxGap + scoreBoxWidth / 2, scoreY + 43)
  
  ctx.fillStyle = '#bbada0'
  drawRoundedRect(ctx, offsetX - 10, offsetY - 10, size * cellSize + (size - 1) * padding + 20, size * cellSize + (size - 1) * padding + 20, 12)
  ctx.fill()
  
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const x = offsetX + j * (cellSize + padding)
      const y = offsetY + i * (cellSize + padding)
      
      ctx.fillStyle = '#cdc1b4'
      drawRoundedRect(ctx, x, y, cellSize, cellSize, 6)
      ctx.fill()
      
      const value = grid[i * size + j]
      if (value !== 0) {
        drawTile(value, x, y, cellSize)
      }
    }
  }
  
  const gridBottomY = offsetY + size * cellSize + (size - 1) * padding + 30
  
  if (gameOver) {
    ctx.fillStyle = 'rgba(238, 228, 218, 0.9)'
    ctx.fillRect(0, gridBottomY - 40, canvas.width, 100)
    
    ctx.fillStyle = '#8f7a66'
    ctx.font = 'bold 32px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('游戏结束', canvas.width / 2, gridBottomY + 5)
    
    ctx.font = '18px Arial'
    ctx.fillText('点击屏幕重新开始', canvas.width / 2, gridBottomY + 35)
  }
  
  if (gameWon) {
    ctx.fillStyle = 'rgba(238, 228, 218, 0.9)'
    ctx.fillRect(0, gridBottomY - 40, canvas.width, 100)
    
    ctx.fillStyle = '#8f7a66'
    ctx.font = 'bold 32px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('恭喜过关!', canvas.width / 2, gridBottomY + 5)
    
    ctx.font = '18px Arial'
    ctx.fillText('点击屏幕进入下一关', canvas.width / 2, gridBottomY + 35)
  }
  
  if (!gameOver && !gameWon) {
    ctx.fillStyle = '#8f7a66'
    ctx.font = '16px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('滑动屏幕移动方块', canvas.width / 2, gridBottomY + 5)
    
    /*if (currentTab === 'home') {
      const resetBtnY = gridBottomY + 25
      const resetBtnX = (canvas.width - 100) / 2
      const resetBtnW = 100
      const resetBtnH = 36
      ctx.fillStyle = '#8f7a66'
      drawRoundedRect(ctx, resetBtnX, resetBtnY, resetBtnW, resetBtnH, 8)
      ctx.fill()
      ctx.fillStyle = '#f9f6f2'
      ctx.font = 'bold 18px Arial'
      ctx.fillText('重置关卡', resetBtnX + resetBtnW / 2, resetBtnY + 22)
    }*/
  }
  
  drawTabBar()
}

function drawRanking() {
  ctx.fillStyle = '#8f7a66'
  ctx.font = 'bold 40px Arial'
  ctx.textAlign = 'center'
  ctx.fillText('排行榜', canvas.width / 2, 80)
  
  const tabWidth = canvas.width / 2
  const tabHeight = 50
  const tabY = 100
  
  ctx.fillStyle = rankingSort === 'level' ? '#edc22e' : '#bbada0'
  drawRoundedRect(ctx, 15, tabY, tabWidth - 22, tabHeight, 6)
  ctx.fill()
  ctx.fillStyle = '#8f7a66'
  ctx.font = 'bold 20px Arial'
  ctx.textAlign = 'center'
  ctx.fillText('关数排名', tabWidth / 2, tabY + 32)
  
  ctx.fillStyle = rankingSort === 'score' ? '#edc22e' : '#bbada0'
  drawRoundedRect(ctx, tabWidth + 8, tabY, tabWidth - 23, tabHeight, 6)
  ctx.fill()
  ctx.fillStyle = '#8f7a66'
  ctx.fillText('总分数排名', tabWidth + tabWidth / 2, tabY + 32)
  
  const rankingY = 170
  const boxHeight = 60
  const gap = 12
  const startY = rankingY
  
  const gameData = wx.getStorageSync('game1024_data')
  
  const displayRecords = []
  
  if (gameData && gameData.weixinName) {
    displayRecords.push({
      weixinName: gameData.weixinName,
      level: gameData.level || 1,
      totalScore: gameData.totalScore || 0
    })
  }
  
  const records = loadRankingData()
  for (let i = 0; i < records.length; i++) {
    if (records[i].weixinId !== gameData?.weixinId) {
      displayRecords.push(records[i])
    }
  }
  
  if (rankingSort === 'level') {
    displayRecords.sort((a, b) => b.level - a.level)
  } else {
    displayRecords.sort((a, b) => b.totalScore - a.totalScore)
  }
  
  for (let i = 0; i < Math.min(displayRecords.length, 5); i++) {
    const y = startY + i * (boxHeight + gap)
    
    ctx.fillStyle = i === 0 ? '#edc22e' : (i === 1 ? '#c9b9a8' : (i === 2 ? '#a67c52' : '#bbada0'))
    drawRoundedRect(ctx, 30, y, canvas.width - 60, boxHeight, 8)
    ctx.fill()
    
    ctx.fillStyle = '#f9f6f2'
    ctx.font = 'bold 28px Arial'
    ctx.textAlign = 'left'
    ctx.fillText(`${i + 1}`, 50, y + 40)
    
    ctx.font = 'bold 22px Arial'
    const name = displayRecords[i].weixinName || '游客'
    ctx.fillText(name, 90, y + 40)
    
    ctx.font = '20px Arial'
    const levelValue = displayRecords[i].level || 1
    ctx.fillText(`关数: ${levelValue}`, 200, y + 40)
    
    ctx.textAlign = 'right'
    const totalScoreValue = displayRecords[i].totalScore || 0
    ctx.fillText(`总分: ${totalScoreValue}`, canvas.width - 50, y + 40)
  }
  
  if (displayRecords.length === 0) {
    ctx.fillStyle = '#8f7a66'
    ctx.font = '24px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('暂无记录', canvas.width / 2, startY + 100)
  }
}

function drawChallenge() {
  ctx.fillStyle = '#8f7a66'
  ctx.font = 'bold 40px Arial'
  ctx.textAlign = 'center'
  ctx.fillText('挑战模式', canvas.width / 2, 60)
  
  const startY = 120
  const boxHeight = 80
  const gap = 15
  
  for (let i = 0; i < challengeLevels.length; i++) {
    const level = challengeLevels[i]
    const y = startY + i * (boxHeight + gap)
    
    ctx.fillStyle = '#bbada0'
    drawRoundedRect(ctx, 30, y, canvas.width - 60, boxHeight, 8)
    ctx.fill()
    
    ctx.fillStyle = '#000000'
    ctx.font = 'bold 24px Arial'
    ctx.textAlign = 'left'
    ctx.fillText(level.name, 60, y + 35)
    
    ctx.font = '20px Arial'
    ctx.fillText(`目标: ${level.target}`, 60, y + 60)
    
    ctx.textAlign = 'right'
    if (level.state === 'locked') {
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 20px Arial'
      ctx.fillText('未解锁', canvas.width - 60, y + 48)
    } else if (level.state === 'completed') {
      ctx.fillStyle = '#988f87'
      ctx.font = 'bold 20px Arial'
      ctx.fillText('已完成', canvas.width - 60, y + 48)
    } else {
      ctx.fillStyle = '#edc22e'
      ctx.font = 'bold 20px Arial'
      ctx.fillText('进行中', canvas.width - 60, y + 48)
    }
  }
  
  ctx.textAlign = 'center'
  ctx.fillStyle = '#8f7a66'
  ctx.font = '16px Arial'
  ctx.fillText('完成闯关模式解锁更多挑战', canvas.width / 2, startY + challengeLevels.length * (boxHeight + gap) + 30)
}

function loadRankingData() {
  try {
    const data = wx.getStorageSync('ranking')
    if (data) {
      const parsed = JSON.parse(data)
      return Array.isArray(parsed) ? parsed : []
    }
    return []
  } catch (e) {
    return []
  }
}

function saveRankingData(records) {
  try {
    wx.setStorageSync('ranking', JSON.stringify(records))
  } catch (e) {
  }
}

function drawTabBar() {
  const tabHeight = 60
  const tabY = canvas.height - tabHeight
  
  ctx.fillStyle = '#faf8ef'
  ctx.fillRect(0, tabY, canvas.width, tabHeight)
  
  ctx.strokeStyle = '#d6cdc2'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, tabY)
  ctx.lineTo(canvas.width, tabY)
  ctx.stroke()
  
  const tabWidth = canvas.width / 3
  
  const tabs = [
    { id: 'home', label: '首页' },
    { id: 'challenge', label: '挑战' },
    { id: 'ranking', label: '排行榜' }
  ]
  
  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i]
    const x = i * tabWidth
    const isActive = currentTab === tab.id
    
    if (isActive) {
      ctx.fillStyle = '#8f7a66'
      ctx.fillRect(x + tabWidth / 4, tabY + 8, tabWidth / 2, 3)
    }
    
    ctx.fillStyle = isActive ? '#8f7a66' : '#988f87'
    ctx.font = 'bold 18px Arial'
    ctx.textAlign = 'center'
    ctx.fillText(tab.label, x + tabWidth / 2, tabY + 40)
  }
}

function drawTile(value, x, y, size) {
  const colors = {
    2: '#eee4da',
    4: '#ede0c8',
    8: '#f2b179',
    16: '#f59563',
    32: '#f67c5f',
    64: '#f65e3b',
    128: '#edcf72',
    256: '#edcc61',
    512: '#edc850',
    1024: '#edc53f',
    2048: '#edc22e'
  }
  
  const textColors = {
    2: '#776e65',
    4: '#776e65',
    8: '#f9f6f2',
    16: '#f9f6f2',
    32: '#f9f6f2',
    64: '#f9f6f2',
    128: '#f9f6f2',
    256: '#f9f6f2',
    512: '#f9f6f2',
    1024: '#f9f6f2',
    2048: '#f9f6f2'
  }
  
  ctx.fillStyle = colors[value] || '#3c3a32'
  drawRoundedRect(ctx, x, y, size, size, 8)
  ctx.fill()
  
  ctx.fillStyle = textColors[value] || '#f9f6f2'
  ctx.font = `bold ${size / 3}px Arial`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(value.toString(), x + size / 2, y + size / 2)
}

function touchStart(e) {
  const touch = e.touches[0]
  startX = touch.clientX
  startY = touch.clientY
  touchTarget = getTouchTarget(startX, startY)
}

function touchEnd(e) {
  const touch = e.changedTouches[0]
  const endX = touch.clientX
  const endY = touch.clientY
  
  if (touchTarget) {
    handleTabClick(touchTarget)
    touchTarget = null
    return
  }
  
  if (currentTab !== 'home' && currentTab !== 'challenge') {
    return
  }
  
  if (gameOver) {
    newGame()
    draw()
    return
  }
  
  const dx = endX - startX
  const dy = endY - startY
  
  const minSwipeDistance = 30
  
  if (Math.abs(dx) < minSwipeDistance && Math.abs(dy) < minSwipeDistance) {
    if (gameWon) {
      nextLevel()
      draw()
    }
    return
  }
  
  if (gameWon) {
    return
  }
  
  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx > 0) {
      moveRight()
    } else {
      moveLeft()
    }
  } else {
    if (dy > 0) {
      moveDown()
    } else {
      moveUp()
    }
  }
  
  draw()
}

function getTouchTarget(x, y) {
  const tabHeight = 60
  const tabY = canvas.height - tabHeight
  
  if (y >= tabY) {
    const tabWidth = canvas.width / 3
    if (x < tabWidth) {
      return 'home'
    } else if (x < tabWidth * 2) {
      return 'challenge'
    } else {
      return 'ranking'
    }
  }
  
  if (currentTab === 'ranking') {
    const tabWidth = canvas.width / 2
    const tabHeight = 50
    const tabY = 100
    
    if (y >= tabY && y <= tabY + tabHeight) {
      if (x < tabWidth) {
        return 'sort_level'
      } else {
        return 'sort_score'
      }
    }
    return null
  }
  
  if (currentTab === 'challenge' && !isChallengeMode) {
    const startY = 120
    const boxHeight = 80
    const gap = 15
    
    for (let i = 0; i < challengeLevels.length; i++) {
      const boxY = startY + i * (boxHeight + gap)
      if (x >= 30 && x <= canvas.width - 30 && y >= boxY && y <= boxY + boxHeight) {
        return `challenge_${challengeLevels[i].id}`
      }
    }
    return null
  }
  
  if (currentTab === 'home' || isChallengeMode) {
    const cellSize = Math.min(canvas.width - 40, canvas.height - 360) / size
    const padding = 10
    const offsetY = 220
    const gridBottomY = offsetY + size * cellSize + (size - 1) * padding + 30
    
    if (currentTab === 'home') {
      const resetBtnY = gridBottomY + 25
      const resetBtnX = (canvas.width - 100) / 2
      const resetBtnW = 100
      const resetBtnH = 36
      if (x >= resetBtnX && x <= resetBtnX + resetBtnW && y >= resetBtnY && y <= resetBtnY + resetBtnH) {
        return 'resetLevel'
      }
    }
  }
  
  return null
}

function handleTabClick(tab) {
  if (tab === 'resetLevel') {
    resetLevel()
    draw()
    return
  }
  
  if (tab === 'sort_level') {
    rankingSort = 'level'
    draw()
    return
  }
  
  if (tab === 'sort_score') {
    rankingSort = 'score'
    draw()
    return
  }
  
  if (tab === 'challenge') {
    if (currentTab === 'challenge' && isChallengeMode) {
      currentTab = 'challenge'
      isChallengeMode = false
      draw()
    } else {
      currentTab = 'challenge'
      isChallengeMode = false
    }
    draw()
    return
  }
  
  if (tab.startsWith('challenge_')) {
    const challengeId = tab.replace('challenge_', '')
    const challenge = challengeLevels.find(c => c.id === challengeId)
    if (challenge && challenge.state !== 'completed') {
      if (challenge.state === 'locked') {
        const challengeIndex = challengeLevels.findIndex(c => c.id === challengeId)
        if (challengeIndex !== -1) {
          challengeLevels[challengeIndex].state = 'available'
        }
      }
      isChallengeMode = true
      currentChallengeId = challengeId
      challengeTarget = challenge.target
      targetScore = challenge.target
      newGame()
      draw()
    }
    return
  }
  
  if (tab === 'ranking') {
    currentTab = 'ranking'
    saveGameData()
    draw()
    return
  }
  
  if (tab === 'home') {
    currentTab = 'home'
    isChallengeMode = false
    newGame()
    draw()
    return
  }
}

function moveLeft() {
  let moved = false
  const newGrid = [...grid]
  
  for (let i = 0; i < size; i++) {
    let row = []
    for (let j = 0; j < size; j++) {
      if (newGrid[i * size + j] !== 0) {
        row.push(newGrid[i * size + j])
      }
    }
    
    for (let j = 0; j < row.length - 1; j++) {
      if (row[j] === row[j + 1]) {
        row[j] *= 2
        row.splice(j + 1, 1)
      }
    }
    
    while (row.length < size) {
      row.push(0)
    }
    
    for (let j = 0; j < size; j++) {
      if (newGrid[i * size + j] !== row[j]) {
        moved = true
      }
      newGrid[i * size + j] = row[j]
    }
  }
  
  if (moved) {
    grid = newGrid
    addRandomTile()
    checkWin()
    checkGameOver()
    draw()
  }
}

function moveRight() {
  let moved = false
  const newGrid = [...grid]
  
  for (let i = 0; i < size; i++) {
    let row = []
    for (let j = size - 1; j >= 0; j--) {
      if (newGrid[i * size + j] !== 0) {
        row.push(newGrid[i * size + j])
      }
    }
    
    for (let j = 0; j < row.length - 1; j++) {
      if (row[j] === row[j + 1]) {
        row[j] *= 2
        row.splice(j + 1, 1)
      }
    }
    
    while (row.length < size) {
      row.push(0)
    }
    
    row.reverse()
    
    for (let j = 0; j < size; j++) {
      if (newGrid[i * size + j] !== row[j]) {
        moved = true
      }
      newGrid[i * size + j] = row[j]
    }
  }
  
  if (moved) {
    grid = newGrid
    addRandomTile()
    checkWin()
    checkGameOver()
    draw()
  }
}

function moveUp() {
  let moved = false
  const newGrid = [...grid]
  
  for (let j = 0; j < size; j++) {
    let col = []
    for (let i = 0; i < size; i++) {
      if (newGrid[i * size + j] !== 0) {
        col.push(newGrid[i * size + j])
      }
    }
    
    for (let i = 0; i < col.length - 1; i++) {
      if (col[i] === col[i + 1]) {
        col[i] *= 2
        col.splice(i + 1, 1)
      }
    }
    
    while (col.length < size) {
      col.push(0)
    }
    
    for (let i = 0; i < size; i++) {
      if (newGrid[i * size + j] !== col[i]) {
        moved = true
      }
      newGrid[i * size + j] = col[i]
    }
  }
  
  if (moved) {
    grid = newGrid
    addRandomTile()
    checkWin()
    checkGameOver()
    draw()
  }
}

function moveDown() {
  let moved = false
  const newGrid = [...grid]
  
  for (let j = 0; j < size; j++) {
    let col = []
    for (let i = size - 1; i >= 0; i--) {
      if (newGrid[i * size + j] !== 0) {
        col.push(newGrid[i * size + j])
      }
    }
    
    for (let i = 0; i < col.length - 1; i++) {
      if (col[i] === col[i + 1]) {
        col[i] *= 2
        col.splice(i + 1, 1)
      }
    }
    
    while (col.length < size) {
      col.push(0)
    }
    
    col.reverse()
    
    for (let i = 0; i < size; i++) {
      if (newGrid[i * size + j] !== col[i]) {
        moved = true
      }
      newGrid[i * size + j] = col[i]
    }
  }
  
  if (moved) {
    grid = newGrid
    addRandomTile()
    checkWin()
    checkGameOver()
    draw()
  }
}

function checkWin() {
  const target = isChallengeMode ? challengeTarget : targetScore
  if (grid.some(cell => cell >= target)) {
    gameWon = true
  }
}

function checkGameOver() {
  if (grid.every(cell => cell !== 0)) {
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        const current = grid[i * size + j]
        if (j < size - 1 && current === grid[i * size + j + 1]) {
          return
        }
        if (i < size - 1 && current === grid[(i + 1) * size + j]) {
          return
        }
      }
    }
    gameOver = true
  }
}

function nextLevel() {
  if (!isChallengeMode) {
    level++
    if (level <= 8) {
      totalScore += 2
      targetScore = Math.pow(2, level + 1)
      score = 2
    } else {
      totalScore += 4
      targetScore = 1024
      score = 4
    }
  } else {
    totalScore += 10
    score = 10
    const challengeIndex = challengeLevels.findIndex(c => c.id === currentChallengeId)
    if (challengeIndex !== -1) {
      challengeLevels[challengeIndex].state = 'completed'
    }
  }
  
  saveGameData()
  newGame()
  draw()
}

function resetLevel() {
  level = 1
  totalScore = 0
  score = 4
  targetScore = 4
  for (let i = 0; i < challengeLevels.length; i++) {
    challengeLevels[i].state = 'locked'
  }
  try {
    wx.removeStorageSync('game1024_data')
  } catch (e) {
  }
  newGame()
}

init()
