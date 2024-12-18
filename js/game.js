// 音频设置
const ENABLE_AUDIO = true;  // 保持启用音频

// 只保留背景音乐
const bgMusic = new Audio('data/audio/background.mp3');
bgMusic.loop = true;
bgMusic.volume = 0.3;

class Game {
    constructor() {
        this.playerInfo = this.loadPlayerInfo() || {
            id: this.generatePlayerId(),
            nickname: '冒险者',
            history: []
        };
        this.locations = [];
        this.initGame();
        
        // 默认启用音频
        this.soundEnabled = true;
        
        // 添加音频错误处理
        bgMusic.addEventListener('error', (e) => {
            console.warn('背景音乐加载失败，请确保文件存在:', e);
            this.soundEnabled = false;
        });

        this.currentTask = null;
        this.inventory = new Set();
        this.initInventoryUI();
    }

    async initGame() {
        try {
            // 修改数据文件路径
            const response = await fetch('data/locations.txt')
                .catch(async () => {
                    console.error('无法加载 locations.txt');
                    throw new Error('无法加载游戏数据，请确保文件路径正确');
                });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.text();
            
            // 检查数据是否为空
            if (!data.trim()) {
                throw new Error('locations.txt 文件为空');
            }

            // 解析数据
            try {
                this.locations = this.parseLocationData(data);
                if (!this.locations.length) {
                    throw new Error('没有可用的位置数据');
                }
            } catch (parseError) {
                console.error('数据解析失败:', parseError);
                throw new Error('位置数据格式不正确');
            }

            // 渲染位置
            this.renderLocations();
            
            // 移除自动播放尝试，改为显示提示
            if (ENABLE_AUDIO && bgMusic) {
                this.showMessage('点击播放按钮开始背景音乐', 3000);
            }
        } catch (error) {
            console.error('游戏初始化失败:', error);
            this.showMessage(`游戏加载失败: ${error.message}`, 5000);
            
            const retryButton = document.createElement('button');
            retryButton.className = 'retry-button';
            retryButton.textContent = '重试';
            retryButton.onclick = () => {
                location.reload();
            };
            document.getElementById('game-container').appendChild(retryButton);
        }
    }

    parseLocationData(data) {
        try {
            return data.split('\n').filter(line => line.trim()).map(line => {
                const parts = line.split('|');
                if (parts.length < 6) {
                    throw new Error(`数据格式不正确: ${line}`);
                }
                const [name, description, hint, isAccessible, action, taskHint] = parts;
                return {
                    name,
                    description,
                    hint,
                    isAccessible: isAccessible === 'true',
                    action,
                    taskHint
                };
            });
        } catch (error) {
            console.error('解析数据失败:', error);
            throw error;
        }
    }

    renderLocations() {
        const gameContainer = document.getElementById('game-container');
        gameContainer.innerHTML = this.locations
            .map(location => `
                <div class="location ${location.isAccessible ? 'accessible' : 'locked'}"
                     onclick="game.handleLocationClick(${JSON.stringify(location).replace(/"/g, '&quot;')})">
                    <h3>${this.escapeHtml(location.name)}</h3>
                    <p>${this.escapeHtml(location.description)}</p>
                    <p class="hint">${this.escapeHtml(location.hint)}</p>
                    ${location.isAccessible ? 
                        `<p class="task-hint">${this.escapeHtml(location.taskHint)}</p>` : 
                        '<p class="locked-message">🔒 暂未解锁</p>'}
                    ${this.getLocationStatus(location)}
                </div>
            `).join('');
    }

    generatePlayerId() {
        return 'player_' + Math.random().toString(36).substr(2, 9);
    }

    loadPlayerInfo() {
        const savedInfo = localStorage.getItem('playerInfo');
        if (savedInfo) {
            const info = JSON.parse(savedInfo);
            // 恢复背包物品
            if (info.inventory) {
                this.inventory = new Set(info.inventory);
            }
            return info;
        }
        return null;
    }

    savePlayerInfo() {
        const playerData = {
            ...this.playerInfo,
            inventory: Array.from(this.inventory) // 将 Set 转换为数组保存
        };
        localStorage.setItem('playerInfo', JSON.stringify(playerData));
    }

    addToHistory(action) {
        this.playerInfo.history.push({
            action,
            timestamp: new Date().toISOString()
        });
        this.savePlayerInfo();
    }

    toggleMusic() {
        if (!this.soundEnabled) {
            this.showMessage('音频功能未启用，请确保音频文件存在');
            return;
        }

        try {
            if (bgMusic.paused) {
                bgMusic.play().then(() => {
                    this.showMessage('音乐已开启');
                }).catch(e => {
                    console.warn('播放失败:', e);
                    this.showMessage('点击播放按钮来启用音乐');
                });
            } else {
                bgMusic.pause();
                this.showMessage('音乐已暂停');
            }
        } catch (error) {
            console.warn('音乐控制失败:', error);
        }
    }

    async handleLocationClick(location) {
        if (!location.isAccessible) {
            this.showMessage('这个地点暂时无法访问！');
            return;
        }

        if (!location.action || typeof this[location.action] !== 'function') {
            console.error(`未找到动作处理方法: ${location.action}`);
            this.showMessage('该位置暂时无法互动！');
            return;
        }

        try {
            const result = await this[location.action](location);
            if (result) {
                this.addToHistory(`在${location.name}完成了任务：${result}`);
                this.updateLocations(location);
            }
        } catch (error) {
            console.error('任务执行失败:', error);
            this.showMessage('任务失败，请重试！');
        }
    }

    async findBook() {
        const result = await this.showPuzzle('书架密码', 
            '找到一个写着数字的纸条：1-3-5，这可能是打开书架的密码...',
            async (answer) => answer === '135'
        );
        
        if (result) {
            this.addToInventory('古籍');
            this.showMessage('你找到了一本神秘的古籍！书中记载着关于神庙的秘密...', 3000);
            return '找到古籍';
        }
    }

    async solvePuzzle() {
        if (!this.inventory.has('古籍')) {
            this.showMessage('需要先在图书馆找到古籍！');
            return;
        }

        const result = await this.showPuzzle('符文谜题',
            '古籍上记载：东南西北，依次点亮符文。提示：用英文字母 E、N、S、W 表示方向...',
            async (answer) => answer.toLowerCase() === 'ensw'
        );

        if (result) {
            this.addToInventory('符文钥匙');
            this.showMessage('符文发出耀眼的光芒，你获得了符文钥匙！', 3000);
            return '解开符文谜题';
        }
    }

    async negotiateGuard() {
        if (!this.inventory.has('符文钥匙')) {
            this.showMessage('守卫拦住了你：没有符文钥匙，不能通过！');
            return;
        }

        await this.showProgress('正在与守卫交涉...', 3000);
        this.addToInventory('通行证');
        this.showMessage('守卫看到符文钥匙，恭敬地为你让开了道路。', 3000);
        return '获得守卫的信任';
    }

    async searchTreasure() {
        if (!this.inventory.has('通行证')) {
            this.showMessage('没有通行证，无法进入密室！');
            return;
        }

        await this.showProgress('正在搜索宝藏...', 5000);
        const treasureTypes = ['金币', '宝石', '古老卷轴', '神秘法器'];
        const randomTreasure = treasureTypes[Math.floor(Math.random() * treasureTypes.length)];
        this.addToInventory(randomTreasure);
        this.showMessage(`恭喜！你找到了传说中的宝藏：${randomTreasure}！`, 5000);
        return `找到宝藏：${randomTreasure}`;
    }

    showMessage(text, duration = 3000) {
        const dialog = document.createElement('div');
        dialog.className = 'dialog-box';
        dialog.textContent = text;
        document.body.appendChild(dialog);
        setTimeout(() => dialog.remove(), duration);
    }

    async showPuzzle(title, hint, validateFn) {
        return new Promise((resolve) => {
            const dialog = document.createElement('div');
            dialog.className = 'dialog-box';
            dialog.innerHTML = `
                <h3>${title}</h3>
                <p>${hint}</p>
                <input type="text" placeholder="输入答案">
                <button>确认</button>
            `;
            
            const input = dialog.querySelector('input');
            const button = dialog.querySelector('button');
            
            const checkAnswer = async () => {
                if (await validateFn(input.value)) {
                    dialog.remove();
                    resolve(true);
                } else {
                    this.showMessage('答案不正确，请重试！');
                }
            };
            
            // 添加回车键支持
            input.addEventListener('keypress', async (e) => {
                if (e.key === 'Enter') {
                    await checkAnswer();
                }
            });
            
            button.onclick = checkAnswer;
            
            document.body.appendChild(dialog);
            input.focus(); // 自动聚焦输入框
        });
    }

    async showProgress(text, duration) {
        return new Promise((resolve) => {
            const dialog = document.createElement('div');
            dialog.className = 'dialog-box';
            dialog.innerHTML = `
                <p>${text}</p>
                <div class="progress-bar">
                    <div class="progress-bar-fill" style="width: 0%"></div>
                </div>
            `;
            
            document.body.appendChild(dialog);
            
            const fill = dialog.querySelector('.progress-bar-fill');
            const startTime = Date.now();
            
            const updateProgress = () => {
                const elapsed = Date.now() - startTime;
                const progress = (elapsed / duration) * 100;
                
                if (progress < 100) {
                    fill.style.width = `${progress}%`;
                    requestAnimationFrame(updateProgress);
                } else {
                    dialog.remove();
                    resolve();
                }
            };
            
            requestAnimationFrame(updateProgress);
        });
    }

    updateLocations(completedLocation) {
        // 根据完成的任务更新其他位置的可访问状态
        if (completedLocation.name === '图书馆') {
            this.locations.find(l => l.name === '神庙').isAccessible = true;
        } else if (completedLocation.name === '神庙') {
            this.locations.find(l => l.name === '守卫营地').isAccessible = true;
        } else if (completedLocation.name === '守卫营地') {
            this.locations.find(l => l.name === '密室').isAccessible = true;
        }
        
        this.renderLocations();
        this.savePlayerInfo();  // 保存游戏状态
    }

    // 添加 HTML 转义方法
    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    initInventoryUI() {
        const inventoryDiv = document.createElement('div');
        inventoryDiv.id = 'inventory';
        inventoryDiv.className = 'inventory-container';
        document.body.appendChild(inventoryDiv);
        this.updateInventoryUI();
    }

    updateInventoryUI() {
        const inventoryDiv = document.getElementById('inventory');
        inventoryDiv.innerHTML = `
            <h3>背包物品</h3>
            <div class="inventory-items">
                ${Array.from(this.inventory).map(item => `
                    <div class="inventory-item">${this.escapeHtml(item)}</div>
                `).join('') || '<p>背包是空的</p>'}
            </div>
        `;
    }

    addToInventory(item) {
        this.inventory.add(item);
        this.updateInventoryUI();
        this.savePlayerInfo();
    }

    getLocationStatus(location) {
        if (location.name === '图书馆' && this.inventory.has('古籍')) {
            return '<p class="completed">✅ 已找到古籍</p>';
        }
        if (location.name === '神庙' && this.inventory.has('符文钥匙')) {
            return '<p class="completed">✅ 已解开符文</p>';
        }
        if (location.name === '守卫营地' && this.inventory.has('通行证')) {
            return '<p class="completed">✅ 已获得通行证</p>';
        }
        return '';
    }
}

// 创建全局游戏实例
window.game = new Game(); 

// 移除页面点击事件监听器，只保留游戏实例创建
window.game = new Game();

// 移除 DOMContentLoaded 事件监听器中的音频相关代码
document.addEventListener('DOMContentLoaded', () => {
    const playerDetails = document.getElementById('player-details');
    playerDetails.innerHTML = `
        <p>ID: ${game.playerInfo.id}</p>
        <p>昵称: ${game.playerInfo.nickname}</p>
    `;
    
    function updateHistory() {
        const historyList = document.getElementById('history-list');
        historyList.innerHTML = game.playerInfo.history
            .map(h => `<div>${new Date(h.timestamp).toLocaleString()} - ${h.action}</div>`)
            .join('');
    }
    updateHistory();
}); 