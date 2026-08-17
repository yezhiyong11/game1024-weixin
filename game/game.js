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
let reviveCount = 0
let maxReviveCount = 3
let gameHistory = []
let isChallengeMode = false
let challengeTarget = 0
let currentChallengeId = null
let startX = 0
let startY = 0
let currentTab = 'home'
let touchTarget = null
let rankingSort = 'score'
let cloudReady = false
let bootStarted = false
let bootPromise = null
let isLoading = true
let cloudEnvId = 'xiaoyouxi10124-d1gtaj0nd63e2279a'

let reviews = []
let reviewAverage = 0
let userReviewScore = 0
let userReviewComment = ''
let hasUserReviewed = false
let reviewLoading = false
let showReviewModal = false

let currentUser = {
  openid: '',
  nickName: '',
  cloudUserId: '',
  level: 1,
  totalScore: 0,
  challenge1024: { level: false, not_lock: false },
  challenge2048: { level: false, not_lock: false },
  challenge4096: { level: false, not_lock: false },
  challenge8192: { level: false, not_lock: false }
}

const challengeLevels = [
  { id: 'easy', name: '初级挑战', target: 1024, state: 'locked', key: 'challenge1024' },
  { id: 'medium', name: '中级挑战', target: 2048, state: 'locked', key: 'challenge2048' },
  { id: 'hard', name: '高级挑战', target: 4096, state: 'locked', key: 'challenge4096' },
  { id: 'master', name: '大师级挑战', target: 8192, state: 'locked', key: 'challenge8192' }
]

function challengeStateFromCloud(c) {
  if (!c) return 'locked'
  if (c.level === true) return 'completed'
  if (c.not_lock === true) return 'available'
  return 'locked'
}

function challengeStateToCloud(state) {
  switch (state) {
    case 'completed': return { level: true, not_lock: true }
    case 'available': return { level: false, not_lock: true }
    default: return { level: false, not_lock: false }
  }
}

function callCloud(action, data) {
  if (!cloudReady) {
    console.warn('[callCloud] cloud not ready, skip action:', action)
    return Promise.reject(new Error('cloud not ready'))
  }
  console.log('[callCloud] → action:', action, 'data:', JSON.stringify(data || {}))
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'gameApi',
      data: Object.assign({ action: action }, data || {}),
      success: (res) => {
        console.log('[callCloud] ←', action, 'result:', JSON.stringify(res.result).substring(0, 200))
        if (res.result && res.result.code === 0) {
          resolve(res.result.data)
        } else {
          reject(new Error((res.result && res.result.message) || 'call cloud failed'))
        }
      },
      fail: (err) => {
        console.error('[callCloud] ✗', action, 'fail:', JSON.stringify(err))
        reject(err)
      }
    })
  })
}

function init() {
  canvas = wx.createCanvas()
  ctx = canvas.getContext('2d')

  const systemInfo = wx.getSystemInfoSync()
  canvas.width = systemInfo.windowWidth
  canvas.height = systemInfo.windowHeight

  drawLoading('正在初始化...')

  try {
    wx.cloud.init({
      env: cloudEnvId || undefined,
      traceUser: true
    })
    cloudReady = true
    console.log('[init] wx.cloud.init OK, cloudReady=true, envId=', cloudEnvId)
  } catch (e) {
    cloudReady = false
    console.warn('[init] wx.cloud.init FAILED', e)
  }

  asyncBoot()

  wx.onTouchStart(touchStart)
  wx.onTouchEnd(touchEnd)

  try {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    })
  } catch (e) {
    console.warn('[init] showShareMenu failed', e)
  }

  wx.onShareAppMessage(() => {
    const topScore = currentUser.totalScore || 0
    return {
      title: `经典游戏1024 - 当前最高分${topScore}，来挑战我吧！`,
      imageUrl: '',
      query: ''
    }
  })

  wx.onShareTimeline(() => {
    const topScore = currentUser.totalScore || 0
    return {
      title: `经典游戏1024 - 挑战你的数字合成能力！最高分${topScore}`,
      imageUrl: ''
    }
  })
}

function asyncBoot() {
  if (bootStarted) {
    console.warn('asyncBoot already started, skipping')
    return bootPromise
  }
  bootStarted = true

  const cached = wx.getStorageSync('game1024_data')
  if (cached && cached.nickName) {
    currentUser.nickName = cached.nickName
    applyLocalCache(cached)
  }

  if (cloudReady) {
    bootPromise = Promise.resolve()
      .then(() => callCloud('getUserData'))
      .then((userData) => {
        if (userData) {
          mergeCloudUser(userData)
          return userData
        }
        return callCloud('login')
      })
      .then((userData) => {
        if (userData) mergeCloudUser(userData)
        finishBoot(false)
      })
      .catch((err) => {
        console.warn('cloud init failed, use local fallback', err)
        finishBoot(false)
      })
  } else {
    bootPromise = Promise.resolve()
    finishBoot(false)
  }
  return bootPromise
}

function mergeCloudUser(userData) {
  if (!userData) return
  if (userData._openid) currentUser.openid = userData._openid
  if (userData._id) currentUser.cloudUserId = userData._id
  if (userData.nickName) currentUser.nickName = userData.nickName
  if (typeof userData.level === 'number') level = userData.level
  if (typeof userData.totalScore === 'number') totalScore = userData.totalScore
  currentUser.level = level
  currentUser.totalScore = totalScore

  const keys = ['challenge1024', 'challenge2048', 'challenge4096', 'challenge8192']
  keys.forEach((k, i) => {
    if (userData[k]) {
      currentUser[k] = userData[k]
      challengeLevels[i].state = challengeStateFromCloud(userData[k])
    }
  })
  console.log('[mergeCloudUser] cloudUserId=', currentUser.cloudUserId)
}

function applyLocalCache(data) {
  if (typeof data.level === 'number') level = data.level
  if (typeof data.totalScore === 'number') totalScore = data.totalScore
  if (data.challenge1024 !== undefined) challengeLevels[0].state = challengeStateFromCloud(data.challenge1024)
  if (data.challenge2048 !== undefined) challengeLevels[1].state = challengeStateFromCloud(data.challenge2048)
  if (data.challenge4096 !== undefined) challengeLevels[2].state = challengeStateFromCloud(data.challenge4096)
  if (data.challenge8192 !== undefined) challengeLevels[3].state = challengeStateFromCloud(data.challenge8192)
  currentUser.level = level
  currentUser.totalScore = totalScore
}

function finishBoot(skipCloudSave) {
  loadLocalFallback()
  const challengeChanged = applyChallengeUnlockRules()
  newGame()
  if (challengeChanged) {
    saveGameData()
  } else {
    saveGameData(skipCloudSave !== true)
  }
  isLoading = false
  draw()
}

function loadLocalFallback() {
  try {
    const data = wx.getStorageSync('game1024_data')
    if (data) {
      if (typeof data.level === 'number') level = data.level
      if (typeof data.totalScore === 'number') totalScore = data.totalScore
      if (data.nickName) currentUser.nickName = data.nickName
      if (data.weixinName) currentUser.nickName = data.weixinName
    }
  } catch (e) {}
}

function applyChallengeUnlockRules() {
  let changed = false
  if (level >= 5 && challengeLevels[0].state !== 'completed') {
    if (challengeLevels[0].state !== 'available' || currentUser.challenge1024.not_lock !== true) {
      challengeLevels[0].state = 'available'
      currentUser.challenge1024 = { level: false, not_lock: true }
      changed = true
    }
  }
  if (level >= 8 && challengeLevels[1].state !== 'completed') {
    if (challengeLevels[1].state !== 'available' || currentUser.challenge2048.not_lock !== true) {
      challengeLevels[1].state = 'available'
      currentUser.challenge2048 = { level: false, not_lock: true }
      changed = true
    }
  }
  if (level >= 10 && challengeLevels[2].state !== 'completed') {
    if (challengeLevels[2].state !== 'available' || currentUser.challenge4096.not_lock !== true) {
      challengeLevels[2].state = 'available'
      currentUser.challenge4096 = { level: false, not_lock: true }
      changed = true
    }
  }
  if (totalScore >= 100 && challengeLevels[3].state !== 'completed') {
    if (challengeLevels[3].state !== 'available' || currentUser.challenge8192.not_lock !== true) {
      challengeLevels[3].state = 'available'
      currentUser.challenge8192 = { level: false, not_lock: true }
      changed = true
    }
  }
  return changed
}

function saveGameData(saveToCloud) {
  console.log('[saveGameData] called, saveToCloud=', saveToCloud, 'cloudReady=', cloudReady, 'level=', level, 'totalScore=', totalScore)
  try {
    const localData = {
      nickName: currentUser.nickName || '',
      score: score,
      totalScore: totalScore,
      level: level,
      challenge1024: currentUser.challenge1024,
      challenge2048: currentUser.challenge2048,
      challenge4096: currentUser.challenge4096,
      challenge8192: currentUser.challenge8192
    }
    wx.setStorageSync('game1024_data', localData)

    const userInfoData = {
      weixinId: currentUser.openid || '',
      weixinName: currentUser.nickName || ''
    }
    wx.setStorageSync('userInfo', userInfoData)

    currentUser.level = level
    currentUser.totalScore = totalScore

    if (saveToCloud !== false && cloudReady) {
      console.log('[saveGameData] → calling updateGame with cloudUserId=', currentUser.cloudUserId)
      callCloud('updateGame', {
        cloudUserId: currentUser.cloudUserId,
        level: level,
        totalScore: totalScore,
        challenge1024: currentUser.challenge1024,
        challenge2048: currentUser.challenge2048,
        challenge4096: currentUser.challenge4096,
        challenge8192: currentUser.challenge8192
      }).then(() => {
        console.log('[saveGameData] ← updateGame SUCCESS')
      }).catch((err) => {
        console.warn('[saveGameData] ← updateGame FAILED:', err.message)
      })
    } else if (!cloudReady) {
      console.warn('[saveGameData] cloudReady=false, SKIP cloud save')
    }
  } catch (e) {
    console.warn('saveGameData error', e)
  }
}

function newGame() {
  grid = Array(size * size).fill(0)
  tiles = []
  score = isChallengeMode ? 10 : (level <= 8 ? 2 : 4)
  gameOver = false
  gameWon = false
  gameHistory = []
  reviveCount = 0

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

function saveGameState() {
  gameHistory.push({
    grid: [...grid],
    tiles: JSON.parse(JSON.stringify(tiles)),
    score: score,
    totalScore: totalScore
  })
  if (gameHistory.length > 10) {
    gameHistory.shift()
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

function drawLoading(text) {
  ctx.fillStyle = '#faf8ef'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#8f7a66'
  ctx.font = 'bold 32px Arial'
  ctx.textAlign = 'center'
  ctx.fillText('经典游戏1024', canvas.width / 2, canvas.height / 2 - 30)
  ctx.font = '18px Arial'
  ctx.fillText(text || '加载中...', canvas.width / 2, canvas.height / 2 + 20)
}

function draw() {
  if (isLoading) {
    drawLoading()
    return
  }

  ctx.fillStyle = '#faf8ef'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  if (currentTab === 'ranking') {
    drawRanking()
    drawTabBar()
    if (showReviewModal) drawReviewModal()
    return
  }

  if (currentTab === 'challenge' && !isChallengeMode) {
    drawChallenge()
    drawTabBar()
    if (showReviewModal) drawReviewModal()
    return
  }

  const cellSize = Math.min(canvas.width - 60, canvas.height - 440) / size
  const padding = 10
  const offsetX = (canvas.width - (size * cellSize + (size - 1) * padding)) / 2
  const offsetY = 195

  ctx.fillStyle = '#8f7a66'
  ctx.font = 'bold 36px Arial'
  ctx.textAlign = 'center'
  ctx.fillText('经典游戏1024', canvas.width / 2, 55)

  let levelText = ''
  if (isChallengeMode && currentChallengeId) {
    const challenge = challengeLevels.find(c => c.id === currentChallengeId)
    levelText = challenge ? challenge.name : `挑战目标: ${challengeTarget}`
  } else {
    levelText = `第 ${level} 关`
  }
  ctx.font = '20px Arial'
  ctx.fillStyle = '#8f7a66'
  ctx.fillText(`${levelText}  目标: ${targetScore}`, canvas.width / 2, 95)

  const scoreBoxWidth = 100
  const scoreBoxHeight = 55
  const scoreBoxGap = 20
  const totalScoreBoxWidth = scoreBoxWidth * 2 + scoreBoxGap
  const scoreStartX = (canvas.width - totalScoreBoxWidth) / 2
  const scoreY = 110

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

  const gridBottomY = offsetY + size * cellSize + (size - 1) * padding + 25

  ctx.fillStyle = '#8f7a66'
  ctx.font = '14px Arial'
  ctx.textAlign = 'center'
  ctx.fillText(`复活次数: ${reviveCount}/${maxReviveCount}`, canvas.width / 2, gridBottomY)

  if (gameOver) {
    ctx.fillStyle = 'rgba(238, 228, 218, 0.9)'
    ctx.fillRect(0, gridBottomY + 10, canvas.width, 120)

    if (reviveCount < maxReviveCount && gameHistory.length >= 1) {
      const reviveBtnX = (canvas.width - 120) / 2
      const reviveBtnY = gridBottomY + 45
      const reviveBtnW = 120
      const reviveBtnH = 36

      ctx.fillStyle = '#edc22e'
      drawRoundedRect(ctx, reviveBtnX, reviveBtnY, reviveBtnW, reviveBtnH, 8)
      ctx.fill()

      ctx.fillStyle = '#8f7a66'
      ctx.font = 'bold 16px Arial'
      ctx.textAlign = 'center'
      ctx.fillText(`复活 (${maxReviveCount - reviveCount})`, reviveBtnX + reviveBtnW / 2, reviveBtnY + 22)
    } else {
      const restartBtnX = (canvas.width - 120) / 2
      const restartBtnY = gridBottomY + 45
      const restartBtnW = 120
      const restartBtnH = 36

      ctx.fillStyle = '#8f7a66'
      drawRoundedRect(ctx, restartBtnX, restartBtnY, restartBtnW, restartBtnH, 8)
      ctx.fill()

      ctx.fillStyle = '#f9f6f2'
      ctx.font = 'bold 16px Arial'
      ctx.textAlign = 'center'
      ctx.fillText('重新开始', restartBtnX + restartBtnW / 2, restartBtnY + 22)
    }
  }

  if (gameWon) {
    ctx.fillStyle = 'rgba(238, 228, 218, 0.9)'
    ctx.fillRect(0, gridBottomY + 10, canvas.width, 120)

    ctx.fillStyle = '#8f7a66'
    ctx.font = 'bold 24px Arial'
    ctx.textAlign = 'center'

    if (isChallengeMode) {
      const challenge = challengeLevels.find(c => c.id === currentChallengeId)
      const challengeName = challenge ? challenge.name : '挑战模式'
      ctx.fillText(`${challengeName}完成!`, canvas.width / 2, gridBottomY + 40)
    } else {
      ctx.fillText(`第 ${level} 关完成!`, canvas.width / 2, gridBottomY + 40)
    }

    ctx.font = '18px Arial'
    ctx.fillText('点击屏幕进入下一关', canvas.width / 2, gridBottomY + 70)
  }

  if (!gameOver && !gameWon) {
    ctx.fillStyle = '#8f7a66'
    ctx.font = '16px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('滑动屏幕移动方块', canvas.width / 2, gridBottomY + 30)

    const reviewBtnX = canvas.width - 95
    const reviewBtnY = gridBottomY + 10
    const reviewBtnW = 80
    const reviewBtnH = 30
    ctx.fillStyle = '#edc22e'
    drawRoundedRect(ctx, reviewBtnX, reviewBtnY, reviewBtnW, reviewBtnH, 6)
    ctx.fill()
    ctx.fillStyle = '#8f7a66'
    ctx.font = 'bold 14px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('★ 评分', reviewBtnX + reviewBtnW / 2, reviewBtnY + 20)
  }

  drawTabBar()
  if (showReviewModal) drawReviewModal()
}

function drawStar(cx, cy, size, filled) {
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const angle = -Math.PI / 2 + i * (2 * Math.PI / 5)
    const outerX = cx + Math.cos(angle) * size / 2
    const outerY = cy + Math.sin(angle) * size / 2
    const innerAngle = angle + Math.PI / 5
    const innerX = cx + Math.cos(innerAngle) * size / 4.5
    const innerY = cy + Math.sin(innerAngle) * size / 4.5
    if (i === 0) ctx.moveTo(outerX, outerY)
    else ctx.lineTo(outerX, outerY)
    ctx.lineTo(innerX, innerY)
  }
  ctx.closePath()
  ctx.fillStyle = filled ? '#edc22e' : '#d6cdc2'
  ctx.fill()
  ctx.strokeStyle = filled ? '#edc22e' : '#d6cdc2'
  ctx.lineWidth = 1
  ctx.stroke()
}

function drawReviewModal() {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const modalW = canvas.width - 40
  const modalX = 20
  const modalY = 80
  const modalH = canvas.height - 120

  ctx.fillStyle = '#ffffff'
  drawRoundedRect(ctx, modalX, modalY, modalW, modalH, 12)
  ctx.fill()

  ctx.fillStyle = '#8f7a66'
  ctx.font = 'bold 22px Arial'
  ctx.textAlign = 'center'
  ctx.fillText('玩家评价', canvas.width / 2, modalY + 30)

  const closeBtnSize = 28
  const closeBtnX = modalX + modalW - closeBtnSize - 10
  const closeBtnY = modalY + 6
  ctx.fillStyle = '#d6cdc2'
  drawRoundedRect(ctx, closeBtnX, closeBtnY, closeBtnSize, closeBtnSize, 14)
  ctx.fill()
  ctx.fillStyle = '#8f7a66'
  ctx.font = 'bold 18px Arial'
  ctx.textAlign = 'center'
  ctx.fillText('×', closeBtnX + closeBtnSize / 2, closeBtnY + 21)

  ctx.fillStyle = '#8f7a66'
  ctx.font = '13px Arial'
  ctx.textAlign = 'center'
  if (reviewAverage > 0) {
    ctx.fillText(`平均评分: ${reviewAverage.toFixed(1)}  ★  |  共 ${reviews.length} 条`, canvas.width / 2, modalY + 54)
  } else {
    ctx.fillText('暂无评价，快来抢沙发吧！', canvas.width / 2, modalY + 54)
  }

  ctx.fillStyle = '#8f7a66'
  ctx.font = 'bold 13px Arial'
  ctx.textAlign = 'center'
  ctx.fillText('请为经典游戏1024打分', canvas.width / 2, modalY + 76)

  const starY = modalY + 90
  const starSize = 28
  const starGap = 6
  const totalStarsW = 5 * starSize + 4 * starGap
  const starStartX = (canvas.width - totalStarsW) / 2
  for (let i = 0; i < 5; i++) {
    const sx = starStartX + i * (starSize + starGap)
    drawStar(sx + starSize / 2, starY + starSize / 2, starSize, i < userReviewScore)
  }

  ctx.fillStyle = '#8f7a66'
  ctx.font = '12px Arial'
  ctx.textAlign = 'center'
  const scoreLabels = ['', '很差', '一般', '还行', '不错', '非常棒!']
  ctx.fillText(scoreLabels[userReviewScore] || '', canvas.width / 2, starY + starSize + 12)

  const inputY = starY + starSize + 22
  ctx.fillStyle = '#f9f6f2'
  drawRoundedRect(ctx, modalX + 20, inputY, modalW - 40, 48, 6)
  ctx.fill()
  ctx.strokeStyle = '#d6cdc2'
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.fillStyle = '#8f7a66'
  ctx.font = '12px Arial'
  ctx.textAlign = 'left'
  const displayText = userReviewComment ? userReviewComment : '点击输入评论...'
  const maxChar = Math.floor((modalW - 60) / 7)
  const shortText = displayText.length > maxChar ? displayText.substring(0, maxChar - 3) + '...' : displayText
  ctx.fillText(shortText, modalX + 28, inputY + 18)
  if (!userReviewComment) {
    ctx.fillStyle = '#b8b0a7'
    ctx.fillText('(最多200字)', modalX + 28, inputY + 36)
  }

  let submitBottomY
  if (!hasUserReviewed) {
    const submitBtnY = inputY + 58
    ctx.fillStyle = userReviewScore > 0 ? '#edc22e' : '#d6cdc2'
    drawRoundedRect(ctx, canvas.width / 2 - 60, submitBtnY, 120, 34, 8)
    ctx.fill()
    ctx.fillStyle = userReviewScore > 0 ? '#8f7a66' : '#b8b0a7'
    ctx.font = 'bold 15px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('提交评价', canvas.width / 2, submitBtnY + 22)
    submitBottomY = submitBtnY + 34
  } else {
    ctx.fillStyle = '#a89880'
    ctx.font = '13px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('你已提交过评价，感谢支持！', canvas.width / 2, inputY + 70)
    submitBottomY = inputY + 80
  }

  const dividerY = submitBottomY + 10
  ctx.strokeStyle = '#e8e0d6'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(modalX + 20, dividerY)
  ctx.lineTo(modalX + modalW - 20, dividerY)
  ctx.stroke()

  ctx.fillStyle = '#8f7a66'
  ctx.font = 'bold 13px Arial'
  ctx.textAlign = 'center'
  ctx.fillText('—— 玩家评价列表 ——', canvas.width / 2, dividerY + 20)

  const listStartY = dividerY + 30
  const listEndY = modalY + modalH - 12
  const lineH = 56
  let displayed = 0
  for (let i = 0; i < reviews.length; i++) {
    const review = reviews[i]
    const ry = listStartY + displayed * lineH
    if (ry + lineH > listEndY) break
    displayed++

    ctx.fillStyle = '#f9f6f2'
    drawRoundedRect(ctx, modalX + 12, ry, modalW - 24, lineH - 8, 6)
    ctx.fill()

    const nickName = review.nickName || '玩家'
    ctx.fillStyle = '#8f7a66'
    ctx.font = 'bold 13px Arial'
    ctx.textAlign = 'left'
    const maxNameW = modalW - 80
    let displayName = nickName
    if (ctx.measureText(nickName).width > maxNameW) {
      while (ctx.measureText(displayName + '...').width > maxNameW && displayName.length > 0) {
        displayName = displayName.substring(0, displayName.length - 1)
      }
      displayName += '...'
    }
    ctx.fillText(displayName, modalX + 22, ry + 18)

    if (review.time) {
      ctx.fillStyle = '#b8b0a7'
      ctx.font = '11px Arial'
      ctx.textAlign = 'right'
      ctx.fillText(review.time, modalX + modalW - 22, ry + 18)
    }

    ctx.fillStyle = '#edc22e'
    ctx.font = '12px Arial'
    ctx.textAlign = 'left'
    const starStr = '★'.repeat(review.score || 0) + '☆'.repeat(5 - (review.score || 0))
    ctx.fillText(starStr, modalX + 22, ry + 34)

    ctx.fillStyle = '#8f7a66'
    ctx.font = '12px Arial'
    const comment = review.comment || '(未填写评论)'
    const cw = modalW - 48
    let displayComment = comment
    if (ctx.measureText(comment).width > cw) {
      while (ctx.measureText(displayComment + '...').width > cw && displayComment.length > 0) {
        displayComment = displayComment.substring(0, displayComment.length - 1)
      }
      displayComment += '...'
    }
    ctx.textAlign = 'left'
    ctx.fillText(displayComment, modalX + 22, ry + 50)
  }

  if (reviews.length === 0 && !reviewLoading) {
    ctx.fillStyle = '#b8b0a7'
    ctx.font = '13px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('还没有评价，成为第一个吧！', canvas.width / 2, listStartY + 22)
  }
}

function getReviewModalRect() {
  return {
    modalX: 20,
    modalY: 80,
    modalW: canvas.width - 40,
    modalH: canvas.height - 120
  }
}

function showReviewInput() {
  if (!showReviewModal) return
  if (hasUserReviewed) return
  wx.showModal({
    title: '输入评论',
    editable: true,
    placeholderText: '分享你的游戏感受... (最多200字)',
    content: userReviewComment || '',
    success: (res) => {
      if (res.confirm) {
        userReviewComment = (res.content || '').substring(0, 200)
      }
      draw()
    },
    fail: () => { draw() }
  })
}

function hideReviewInput() {}

function loadReviews() {
  reviewLoading = true
  callCloud('getReviews', {}).then((data) => {
    reviews = (data && data.list) || []
    reviewAverage = (data && data.average) || 0
    hasUserReviewed = !!(data && data.userReviewed)
    reviewLoading = false
    draw()
  }).catch((err) => {
    reviewLoading = false
    console.warn('[loadReviews] failed:', err.message)
    reviews = []
    reviewAverage = 0
    hasUserReviewed = false
    draw()
  })
}

function submitReview() {
  if (userReviewScore <= 0) {
    wx.showToast({ title: '请先选择星级评分', icon: 'none' })
    return
  }
  if (bootPromise && bootPromise.then) {
    bootPromise.then(() => doSubmitReview())
  } else {
    doSubmitReview()
  }
}

function doSubmitReview() {
  if (!currentUser.cloudUserId && !currentUser.openid) {
    wx.showToast({ title: '正在登录，请稍候...', icon: 'none' })
    return
  }
  console.log('[submitReview] cloudUserId=', currentUser.cloudUserId, 'openid=', currentUser.openid, 'score=', userReviewScore)
  callCloud('saveReview', {
    cloudUserId: currentUser.cloudUserId,
    score: userReviewScore,
    comment: userReviewComment || ''
  }).then(() => {
    hasUserReviewed = true
    userReviewComment = ''
    wx.showToast({ title: '评价成功！', icon: 'success' })
    loadReviews()
  }).catch((err) => {
    console.error('[submitReview] FAILED:', err)
    wx.showToast({ title: '提交失败: ' + (err.message || '未知错误'), icon: 'none' })
  })
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

  if (rankingCache && rankingCache.length > 0) {
    for (let i = 0; i < Math.min(rankingCache.length, 5); i++) {
      const record = rankingCache[i]
      const y = startY + i * (boxHeight + gap)

      ctx.fillStyle = i === 0 ? '#edc22e' : (i === 1 ? '#c9b9a8' : (i === 2 ? '#a67c52' : '#bbada0'))
      drawRoundedRect(ctx, 8, y, canvas.width - 16, boxHeight, 8)
      ctx.fill()

      ctx.fillStyle = '#f9f6f2'
      ctx.font = 'bold 24px Arial'
      ctx.textAlign = 'left'
      ctx.fillText(`${i + 1}`, 16, y + 38)

      ctx.font = '18px Arial'
      const name = record.nickName || record.weixinName || '玩家'
      ctx.fillText(name, 38, y + 38)

      ctx.font = '18px Arial'
      const levelValue = record.level || 1
      ctx.textAlign = 'right'
      ctx.fillText(`关数: ${levelValue}`, canvas.width * 0.65, y + 38)

      ctx.fillText(`总分: ${record.totalScore || 0}`, canvas.width - 16, y + 38)
    }
  } else if (rankingLoading) {
    ctx.fillStyle = '#8f7a66'
    ctx.font = '22px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('加载排行榜...', canvas.width / 2, startY + 80)
  } else {
    ctx.fillStyle = '#8f7a66'
    ctx.font = '24px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('暂无记录', canvas.width / 2, startY + 100)
  }
}

let rankingCache = null
let rankingLoading = false

function loadRanking() {
  rankingLoading = true
  rankingCache = null
  if (cloudReady) {
    callCloud('getRanking', {
      sortBy: rankingSort === 'level' ? 'level' : 'totalScore',
      order: 'desc',
      limit: 20
    }).then((data) => {
      rankingCache = data || []
    }).catch((err) => {
      console.warn('getRanking failed', err)
      rankingCache = []
    }).then(() => {
      rankingLoading = false
      if (currentTab === 'ranking') draw()
    })
  } else {
    rankingCache = loadLocalRanking()
    rankingLoading = false
    draw()
  }
}

function loadLocalRanking() {
  try {
    const data = wx.getStorageSync('ranking')
    if (data) {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data
      if (Array.isArray(parsed)) return parsed
    }
  } catch (e) {}
  return []
}

function saveLocalRanking(records) {
  try {
    wx.setStorageSync('ranking', JSON.stringify(records))
  } catch (e) {}
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
    const lvl = challengeLevels[i]
    const y = startY + i * (boxHeight + gap)

    ctx.fillStyle = '#bbada0'
    drawRoundedRect(ctx, 30, y, canvas.width - 60, boxHeight, 8)
    ctx.fill()

    ctx.fillStyle = '#000000'
    ctx.font = 'bold 24px Arial'
    ctx.textAlign = 'left'
    ctx.fillText(lvl.name, 60, y + 35)

    ctx.font = '20px Arial'
    ctx.fillText(`目标: ${lvl.target}`, 60, y + 60)

    ctx.textAlign = 'right'
    if (lvl.state === 'locked') {
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 20px Arial'
      ctx.fillText('未解锁', canvas.width - 60, y + 48)
    } else if (lvl.state === 'completed') {
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

function drawTabBar() {
  const tabHeight = 56
  const tabY = canvas.height - tabHeight - 12

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

  if (showReviewModal) {
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
  if (showReviewModal) {
    const { modalX, modalY, modalW } = getReviewModalRect()
    const closeBtnSize = 28
    const closeBtnX = modalX + modalW - closeBtnSize - 10
    const closeBtnY = modalY + 6
    if (x >= closeBtnX && x <= closeBtnX + closeBtnSize && y >= closeBtnY && y <= closeBtnY + closeBtnSize) {
      return 'review_close'
    }
    const starY = modalY + 90
    const starSize = 28
    const starGap = 6
    const totalStarsW = 5 * starSize + 4 * starGap
    const starStartX = (canvas.width - totalStarsW) / 2
    for (let i = 0; i < 5; i++) {
      const sx = starStartX + i * (starSize + starGap)
      if (x >= sx && x <= sx + starSize && y >= starY && y <= starY + starSize) {
        return 'review_star_' + (i + 1)
      }
    }
    const inputY = starY + starSize + 22
    if (x >= modalX + 20 && x <= modalX + modalW - 20 && y >= inputY && y <= inputY + 48) return 'review_input'
    if (!hasUserReviewed) {
      const submitBtnY = inputY + 58
      if (x >= canvas.width / 2 - 60 && x <= canvas.width / 2 + 60 && y >= submitBtnY && y <= submitBtnY + 34) {
        return 'review_submit'
      }
    }
    return null
  }

  const tabHeight = 56
  const tabY = canvas.height - tabHeight - 12

  if (y >= tabY) {
    const tabWidth = canvas.width / 3
    if (x < tabWidth) return 'home'
    if (x < tabWidth * 2) return 'challenge'
    return 'ranking'
  }

  if (currentTab === 'ranking') {
    const tW = canvas.width / 2
    const tH = 50
    const tY = 100
    if (y >= tY && y <= tY + tH) {
      if (x < tW) return 'sort_level'
      return 'sort_score'
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
        return 'challenge_' + challengeLevels[i].id
      }
    }
    return null
  }

  if (currentTab === 'home' || isChallengeMode) {
    const cellSize = Math.min(canvas.width - 60, canvas.height - 440) / size
    const padding = 10
    const offsetY = 195
    const gridBottomY = offsetY + size * cellSize + (size - 1) * padding + 25

    if (!gameOver && !gameWon) {
      const reviewBtnX = canvas.width - 95
      const reviewBtnY = gridBottomY + 10
      if (x >= reviewBtnX && x <= reviewBtnX + 80 && y >= reviewBtnY && y <= reviewBtnY + 30) {
        return 'review_open'
      }
    }

    if (gameOver) {
      if (reviveCount < maxReviveCount && gameHistory.length >= 1) {
        const bx = (canvas.width - 120) / 2
        const by = gridBottomY + 45
        if (x >= bx && x <= bx + 120 && y >= by && y <= by + 36) return 'revive'
      } else {
        const bx = (canvas.width - 120) / 2
        const by = gridBottomY + 45
        if (x >= bx && x <= bx + 120 && y >= by && y <= by + 36) return 'restart'
      }
    }
  }

  return null
}

function handleTabClick(tab) {
  if (tab === 'review_open') {
    showReviewModal = true
    loadReviews()
    draw()
    return
  }

  if (tab === 'review_close') {
    showReviewModal = false
    hideReviewInput()
    draw()
    return
  }

  if (tab.startsWith('review_star_')) {
    userReviewScore = parseInt(tab.replace('review_star_', ''))
    draw()
    return
  }

  if (tab === 'review_input') {
    if (hasUserReviewed) {
      wx.showToast({ title: '你已提交过评价，感谢支持！', icon: 'none' })
      return
    }
    showReviewInput()
    return
  }

  if (tab === 'review_submit') {
    hideReviewInput()
    submitReview()
    return
  }

  if (tab === 'revive') {
    revive()
    return
  }

  if (tab === 'restart') {
    newGame()
    return
  }

  if (tab === 'sort_level') {
    rankingSort = 'level'
    loadRanking()
    return
  }

  if (tab === 'sort_score') {
    rankingSort = 'score'
    loadRanking()
    return
  }

  if (tab === 'challenge') {
    currentTab = 'challenge'
    isChallengeMode = false
    draw()
    return
  }

  if (tab.startsWith('challenge_')) {
    const challengeId = tab.replace('challenge_', '')
    const idx = challengeLevels.findIndex(c => c.id === challengeId)
    if (idx === -1) return

    const challenge = challengeLevels[idx]

    if (idx > 0) {
      const prev = challengeLevels[idx - 1]
      const prevCompleted = currentUser[prev.key] && currentUser[prev.key].level === true
      if (!prevCompleted) {
        wx.showToast({ title: `请先完成「${prev.name}」`, icon: 'none' })
        return
      }
    }

    if (challenge.state === 'completed') {
      wx.showToast({ title: '该挑战已完成', icon: 'none' })
      return
    }

    if (challenge.state === 'locked') {
      challengeLevels[idx].state = 'available'
      currentUser[challenge.key] = { level: false, not_lock: true }
      saveGameData()
    }

    isChallengeMode = true
    currentChallengeId = challengeId
    challengeTarget = challenge.target
    targetScore = challenge.target
    newGame()
    draw()
    return
  }

  if (tab === 'ranking') {
    currentTab = 'ranking'
    saveGameData()
    loadRanking()
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
      if (newGrid[i * size + j] !== 0) row.push(newGrid[i * size + j])
    }
    for (let j = 0; j < row.length - 1; j++) {
      if (row[j] === row[j + 1]) {
        row[j] *= 2
        row.splice(j + 1, 1)
      }
    }
    while (row.length < size) row.push(0)
    for (let j = 0; j < size; j++) {
      if (newGrid[i * size + j] !== row[j]) moved = true
      newGrid[i * size + j] = row[j]
    }
  }

  if (moved) {
    saveGameState()
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
      if (newGrid[i * size + j] !== 0) row.push(newGrid[i * size + j])
    }
    for (let j = 0; j < row.length - 1; j++) {
      if (row[j] === row[j + 1]) {
        row[j] *= 2
        row.splice(j + 1, 1)
      }
    }
    while (row.length < size) row.push(0)
    row.reverse()
    for (let j = 0; j < size; j++) {
      if (newGrid[i * size + j] !== row[j]) moved = true
      newGrid[i * size + j] = row[j]
    }
  }

  if (moved) {
    saveGameState()
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
      if (newGrid[i * size + j] !== 0) col.push(newGrid[i * size + j])
    }
    for (let i = 0; i < col.length - 1; i++) {
      if (col[i] === col[i + 1]) {
        col[i] *= 2
        col.splice(i + 1, 1)
      }
    }
    while (col.length < size) col.push(0)
    for (let i = 0; i < size; i++) {
      if (newGrid[i * size + j] !== col[i]) moved = true
      newGrid[i * size + j] = col[i]
    }
  }

  if (moved) {
    saveGameState()
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
      if (newGrid[i * size + j] !== 0) col.push(newGrid[i * size + j])
    }
    for (let i = 0; i < col.length - 1; i++) {
      if (col[i] === col[i + 1]) {
        col[i] *= 2
        col.splice(i + 1, 1)
      }
    }
    while (col.length < size) col.push(0)
    col.reverse()
    for (let i = 0; i < size; i++) {
      if (newGrid[i * size + j] !== col[i]) moved = true
      newGrid[i * size + j] = col[i]
    }
  }

  if (moved) {
    saveGameState()
    grid = newGrid
    addRandomTile()
    checkWin()
    checkGameOver()
    draw()
  }
}

function checkWin() {
  const target = isChallengeMode ? challengeTarget : targetScore
  if (grid.some(cell => cell >= target)) gameWon = true
}

function checkGameOver() {
  if (grid.every(cell => cell !== 0)) {
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        const current = grid[i * size + j]
        if (j < size - 1 && current === grid[i * size + j + 1]) return
        if (i < size - 1 && current === grid[(i + 1) * size + j]) return
      }
    }
    if (reviveCount < maxReviveCount) {
      gameOver = true
    } else {
      newGame()
    }
  }
}

function revive() {
  if (reviveCount >= maxReviveCount) return

  if (gameHistory.length >= 2) {
    gameHistory.pop()
    const lastState = gameHistory.pop()
    grid = lastState.grid
    tiles = lastState.tiles
    score = lastState.score
    totalScore = lastState.totalScore
    gameOver = false
    reviveCount++
    draw()
  } else if (gameHistory.length === 1) {
    const lastState = gameHistory.pop()
    grid = lastState.grid
    tiles = lastState.tiles
    score = lastState.score
    totalScore = lastState.totalScore
    gameOver = false
    reviveCount++
    draw()
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
      currentUser[challengeLevels[challengeIndex].key] = { level: true, not_lock: true }
      console.log('[nextLevel] challenge COMPLETED:', challengeLevels[challengeIndex].key, '=', JSON.stringify(currentUser[challengeLevels[challengeIndex].key]))
    }

    const nextChallengeIndex = challengeIndex + 1
    if (nextChallengeIndex < challengeLevels.length) {
      const nextKey = challengeLevels[nextChallengeIndex].key
      if (challengeLevels[nextChallengeIndex].state === 'locked') {
        challengeLevels[nextChallengeIndex].state = 'available'
        currentUser[nextKey] = { level: false, not_lock: true }
        console.log('[nextLevel] next challenge UNLOCKED:', nextKey)
      }
      currentChallengeId = challengeLevels[nextChallengeIndex].id
      challengeTarget = challengeLevels[nextChallengeIndex].target
      targetScore = challengeLevels[nextChallengeIndex].target
    } else {
      console.log('[nextLevel] all challenges completed, no next challenge')
    }
  }

  console.log('[nextLevel] saving to cloud, cloudUserId=', currentUser.cloudUserId, 'level=', level, 'totalScore=', totalScore)
  console.log('[nextLevel] challenge1024=', JSON.stringify(currentUser.challenge1024), 'challenge2048=', JSON.stringify(currentUser.challenge2048), 'challenge4096=', JSON.stringify(currentUser.challenge4096), 'challenge8192=', JSON.stringify(currentUser.challenge8192))
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
    const key = challengeLevels[i].key
    currentUser[key] = { level: false, not_lock: false }
  }
  try {
    wx.removeStorageSync('game1024_data')
  } catch (e) {}
  saveGameData()
  newGame()
}

init()
