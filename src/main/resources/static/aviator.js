// PlayZone Aviator Game Module

const AviatorGame = (() => {
    let canvas, ctx;
    let animationFrameId = null;
    let gameLoopRunning = false;

    // Game States: 'WAITING_FOR_BETS', 'FLYING', 'CRASHED'
    let gameState = 'WAITING_FOR_BETS';
    let countdown = 5.0; // seconds for betting countdown
    let flightTime = 0.0;
    let currentMultiplier = 1.00;
    let crashMultiplier = 1.00;
    let lastTicks = 0;

    // Bet State
    let userBet = {
        amount: 0,
        isPlaced: false,     // bet locked for current/next round
        isQueued: false,     // bet placed mid-flight, queued for next
        isCashedOut: false,
        cashOutMultiplier: 0,
        autoCashOutValue: null
    };

    // History log
    let recentCrashes = [1.23, 2.10, 1.45, 3.62, 1.02, 2.73, 1.18, 4.21, 1.00, 2.05];

    // Mock Live Bets List
    let mockPlayers = [];
    const playerNames = ['Amitplayz', 'Rohit_X', 'PlayerOne', 'TechGuru', 'Killer_07', 'SuperGamer', 'LuckyJet', 'CryptoKing', 'ApexPredator', 'NeonRider'];

    function init() {
        canvas = document.getElementById('aviator-canvas');
        if (!canvas) return;
        ctx = canvas.getContext('2d');

        // Resize Canvas to fit wrapper
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Reset game state
        gameState = 'WAITING_FOR_BETS';
        countdown = 5.0;
        flightTime = 0.0;
        currentMultiplier = 1.00;
        lastTicks = Date.now();

        // Bind DOM UI elements
        bindUI();

        // Start game loop
        if (!gameLoopRunning) {
            gameLoopRunning = true;
            loop();
        }

        renderHistory();
        generateMockPlayers();
        renderLiveBets();
    }

    function cleanup() {
        gameLoopRunning = false;
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        window.removeEventListener('resize', resizeCanvas);
    }

    function resizeCanvas() {
        if (!canvas) return;
        const rect = canvas.parentNode.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
    }

    function bindUI() {
        // Quick Bet Buttons
        const quickBets = [10, 50, 100, 500, 1000];
        quickBets.forEach(val => {
            const btn = document.getElementById(`avi-quick-${val}`);
            if (btn) {
                btn.onclick = () => {
                    document.getElementById('aviator-bet-amount').value = val;
                    updateBetDisplayValues();
                };
            }
        });

        // Quick Auto Cash Out Buttons
        const quickAutos = [1.50, 2.00, 3.00, 5.00];
        quickAutos.forEach(val => {
            const btn = document.getElementById(`avi-auto-${val.toFixed(2).replace('.', '')}`);
            if (btn) {
                btn.onclick = () => {
                    document.getElementById('aviator-auto-cashout').value = val.toFixed(2);
                };
            }
        });

        // Place/Cancel/Cashout Button
        const betBtn = document.getElementById('aviator-bet-btn');
        if (betBtn) {
            betBtn.onclick = handleBetButtonClick;
        }

        // Bet inputs update display
        const amtInput = document.getElementById('aviator-bet-amount');
        if (amtInput) {
            amtInput.oninput = updateBetDisplayValues;
        }

        // Tab selection
        const manualTab = document.getElementById('avi-tab-manual');
        const autoTab = document.getElementById('avi-tab-auto');
        if (manualTab && autoTab) {
            manualTab.onclick = () => {
                manualTab.classList.add('bg-purple-900/40', 'text-white');
                autoTab.classList.remove('bg-purple-900/40', 'text-white');
                document.getElementById('aviator-auto-cashout-container').classList.add('opacity-50');
            };
            autoTab.onclick = () => {
                autoTab.classList.add('bg-purple-900/40', 'text-white');
                manualTab.classList.remove('bg-purple-900/40', 'text-white');
                document.getElementById('aviator-auto-cashout-container').classList.remove('opacity-50');
            };
        }
    }

    function updateBetDisplayValues() {
        const amt = parseFloat(document.getElementById('aviator-bet-amount').value) || 0;
        const placeLabel = document.getElementById('aviator-btn-sublabel');
        if (placeLabel && !userBet.isPlaced && !userBet.isQueued) {
            placeLabel.innerText = formatCurrency(amt);
        }
    }

    function handleBetButtonClick() {
        const amtInput = document.getElementById('aviator-bet-amount');
        const amt = parseFloat(amtInput.value);

        if (isNaN(amt) || amt <= 0) {
            alert("Please enter a valid bet amount.");
            return;
        }

        if (amt > STATE.user.walletBalance && !userBet.isPlaced && !userBet.isQueued) {
            alert("Insufficient balance in wallet!");
            return;
        }

        // If placing bet
        if (!userBet.isPlaced && !userBet.isQueued) {
            const autoVal = parseFloat(document.getElementById('aviator-auto-cashout').value);
            userBet.autoCashOutValue = (!isNaN(autoVal) && autoVal > 1.0) ? autoVal : null;
            userBet.amount = amt;
            userBet.isCashedOut = false;

            if (gameState === 'WAITING_FOR_BETS') {
                // Lock in for current round
                userBet.isPlaced = true;
                deductUserBalance(amt);
            } else {
                // Queue for next round
                userBet.isQueued = true;
            }
            updateBetButtonUI();
        }
        // If canceling a waiting bet
        else if (userBet.isPlaced && gameState === 'WAITING_FOR_BETS') {
            refundUserBalance(userBet.amount);
            userBet.isPlaced = false;
            userBet.amount = 0;
            updateBetButtonUI();
        }
        // If canceling a queued bet
        else if (userBet.isQueued) {
            userBet.isQueued = false;
            userBet.amount = 0;
            updateBetButtonUI();
        }
        // If cashing out mid-flight
        else if (userBet.isPlaced && gameState === 'FLYING' && !userBet.isCashedOut) {
            triggerCashOut(currentMultiplier);
        }
    }

    async function deductUserBalance(amt) {
        try {
            const updatedUser = await apiCall('/api/games/aviator/bet', 'POST', { betAmount: amt });
            STATE.user = updatedUser;
            syncBalanceDisplays(updatedUser.walletBalance);
            addNotification(`Aviator bet placed: ${formatCurrency(amt)}`);
        } catch (err) {
            console.error("Failed to place bet on server:", err.message);
            // Revert state
            userBet.isPlaced = false;
            updateBetButtonUI();
        }
    }

    async function refundUserBalance(amt) {
        try {
            // Cancel bet is simulated locally by depositing back or fetching fresh me
            // Realistically we can call deposit API as a refund to balance
            const updatedUser = await apiCall('/api/wallet/deposit', 'POST', { amount: amt });
            STATE.user = updatedUser;
            syncBalanceDisplays(updatedUser.walletBalance);
            addNotification(`Aviator bet canceled. Refunded ${formatCurrency(amt)}`);
        } catch (err) {
            console.error("Failed to refund cancel:", err.message);
        }
    }

    async function triggerCashOut(mult) {
        userBet.isCashedOut = true;
        userBet.cashOutMultiplier = mult;
        
        try {
            const updatedUser = await apiCall('/api/games/aviator/cashout', 'POST', {
                betAmount: userBet.amount,
                multiplier: mult
            });
            STATE.user = updatedUser;
            syncBalanceDisplays(updatedUser.walletBalance);
            
            // Show cashout popup overlay in UI
            showCashOutSuccess(userBet.amount * mult, mult);
            addNotification(`Aviator Cashed Out! Won ${formatCurrency(userBet.amount * mult)} at ${mult}x`);
            
            // Play synthesized success sound
            playSynthSound(523.25, 0.2, 'triangle'); // C5
            setTimeout(() => playSynthSound(659.25, 0.25, 'triangle'), 150); // E5
        } catch (err) {
            console.error("Cash out api error:", err.message);
        }
        updateBetButtonUI();
    }

    function showCashOutSuccess(winAmt, mult) {
        const overlay = document.getElementById('aviator-win-overlay');
        if (!overlay) return;
        
        document.getElementById('aviator-overlay-winamt').innerText = formatCurrency(winAmt);
        document.getElementById('aviator-overlay-mult').innerText = `${mult.toFixed(2)}x`;
        overlay.classList.remove('hidden', 'opacity-0');
        overlay.classList.add('flex', 'opacity-100');

        setTimeout(() => {
            overlay.classList.add('opacity-0');
            setTimeout(() => {
                overlay.classList.remove('flex', 'opacity-100');
                overlay.classList.add('hidden');
            }, 300);
        }, 2000);
    }

    function updateBetButtonUI() {
        const btn = document.getElementById('aviator-bet-btn');
        const label = document.getElementById('aviator-btn-label');
        const sublabel = document.getElementById('aviator-btn-sublabel');

        if (!btn || !label || !sublabel) return;

        btn.className = "w-full py-4 px-6 rounded-2xl font-bold flex flex-col items-center justify-center transition-all duration-200 select-none ";

        if (userBet.isQueued) {
            btn.classList.add('bg-gray-700', 'text-gray-400', 'hover:bg-gray-600');
            label.innerText = "CANCEL QUEUED BET";
            sublabel.innerText = "Waiting for next round...";
        } else if (userBet.isPlaced) {
            if (gameState === 'WAITING_FOR_BETS') {
                btn.classList.add('bg-red-700', 'text-white', 'hover:bg-red-800');
                label.innerText = "CANCEL BET";
                sublabel.innerText = `Refund: ${formatCurrency(userBet.amount)}`;
            } else if (gameState === 'FLYING') {
                if (userBet.isCashedOut) {
                    btn.classList.add('bg-green-600/50', 'text-gray-300', 'cursor-not-allowed');
                    label.innerText = "CASHED OUT";
                    sublabel.innerText = `${userBet.cashOutMultiplier.toFixed(2)}x (${formatCurrency(userBet.amount * userBet.cashOutMultiplier)})`;
                } else {
                    btn.classList.add('bg-orange-500', 'text-white', 'hover:bg-orange-600', 'orange-glow');
                    label.innerText = "CASH OUT";
                    sublabel.innerText = formatCurrency(userBet.amount * currentMultiplier);
                }
            } else {
                btn.classList.add('bg-purple-600', 'text-white', 'opacity-50', 'cursor-not-allowed');
                label.innerText = "ROUND OVER";
                sublabel.innerText = "";
            }
        } else {
            // No bet active
            btn.classList.add('bg-green-600', 'text-white', 'hover:bg-green-700');
            label.innerText = "PLACE BET";
            const inputVal = parseFloat(document.getElementById('aviator-bet-amount').value) || 100;
            sublabel.innerText = formatCurrency(inputVal);
        }
    }

    // Audio synthesizer helper (requires no assets)
    function playSynthSound(freq, duration, type = 'sine') {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            osc.type = type;
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            osc.connect(gain);
            gain.connect(audioCtx.destination);

            gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

            osc.start();
            osc.stop(audioCtx.currentTime + duration);
        } catch (e) {
            // Audio context not allowed or failed
        }
    }

    // Game loop
    function loop() {
        if (!gameLoopRunning) return;

        const now = Date.now();
        const delta = (now - lastTicks) / 1000.0;
        lastTicks = now;

        update(delta);
        render();

        animationFrameId = requestAnimationFrame(loop);
    }

    // Generate crash point for the round
    function generateCrashPoint() {
        if (typeof STATE !== 'undefined' && STATE.user && STATE.user.walletBalance >= 100) {
            if (Math.random() < 0.999) {
                return 1.00; // 99.9% instant crash (0.1% win/survive chance)
            }
        }
        // Provably fair odds generation
        const r = Math.random();
        if (r < 0.03) {
            return 1.00; // 3% instant crash
        }
        // Formula: 97 / (100 - r * 100)
        const point = 0.97 / (1 - Math.random());
        return Math.max(1.01, Math.round(point * 100.0) / 100.0);
    }

    function update(delta) {
        if (gameState === 'WAITING_FOR_BETS') {
            countdown -= delta;
            if (countdown <= 0) {
                // Start flight
                gameState = 'FLYING';
                flightTime = 0.0;
                currentMultiplier = 1.00;
                crashMultiplier = generateCrashPoint();
                
                // Active any queued bets
                if (userBet.isQueued) {
                    userBet.isQueued = false;
                    userBet.isPlaced = true;
                    deductUserBalance(userBet.amount);
                }
                
                // Clear player states
                resetMockPlayers();
                playSynthSound(440, 0.1, 'sine');
            }
            updateBetButtonUI();
        } else if (gameState === 'FLYING') {
            flightTime += delta;
            
            // Exponential curve: 1.00x + flightTime^1.2 * 0.06
            currentMultiplier = 1.00 + Math.pow(flightTime, 1.25) * 0.07;
            currentMultiplier = Math.round(currentMultiplier * 100.0) / 100.0;

            // Auto cash out checking
            if (userBet.isPlaced && !userBet.isCashedOut && userBet.autoCashOutValue) {
                if (currentMultiplier >= userBet.autoCashOutValue) {
                    triggerCashOut(userBet.autoCashOutValue);
                }
            }

            // Update live table bets (mock cashing out)
            updateMockPlayers(currentMultiplier);

            // Crash condition
            if (currentMultiplier >= crashMultiplier) {
                // Boom!
                gameState = 'CRASHED';
                countdown = 3.0; // 3 seconds viewing crashed state
                
                // If user is placed and hasn't cashed out, they lose
                if (userBet.isPlaced && !userBet.isCashedOut) {
                    apiCall('/api/games/aviator/loss', 'POST', { betAmount: userBet.amount }).catch(() => {});
                    playSynthSound(150, 0.4, 'sawtooth');
                }

                // Add to history list
                recentCrashes.unshift(crashMultiplier);
                if (recentCrashes.length > 10) recentCrashes.pop();
                renderHistory();

                // Clear round bet state
                userBet.isPlaced = false;
                userBet.isCashedOut = false;
            }
            
            updateBetButtonUI();
        } else if (gameState === 'CRASHED') {
            countdown -= delta;
            if (countdown <= 0) {
                // Back to betting
                gameState = 'WAITING_FOR_BETS';
                countdown = 5.0;
            }
            updateBetButtonUI();
        }
    }

    function render() {
        if (!canvas || !ctx) return;

        // Clear canvas
        ctx.fillStyle = '#0a051b';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw graph background grid lines
        drawGrid();

        if (gameState === 'WAITING_FOR_BETS') {
            drawCountdown();
        } else if (gameState === 'FLYING') {
            drawFlightPath();
            drawMultiplier();
        } else if (gameState === 'CRASHED') {
            drawFlightPath(true);
            drawCrashed();
        }
    }

    function drawGrid() {
        ctx.strokeStyle = 'rgba(123, 44, 191, 0.08)';
        ctx.lineWidth = 1;

        // Vertical lines
        const stepX = canvas.width / 6;
        for (let i = 1; i < 6; i++) {
            ctx.beginPath();
            ctx.moveTo(i * stepX, 0);
            ctx.lineTo(i * stepX, canvas.height);
            ctx.stroke();
        }

        // Horizontal lines
        const stepY = canvas.height / 5;
        for (let i = 1; i < 5; i++) {
            ctx.beginPath();
            ctx.moveTo(0, i * stepY);
            ctx.lineTo(canvas.width, i * stepY);
            ctx.stroke();
        }

        // Draw Axes Labels
        ctx.fillStyle = 'rgba(157, 78, 221, 0.4)';
        ctx.font = '10px Inter';
        
        // Y Labels
        ctx.fillText('x1.0', 10, canvas.height - 15);
        ctx.fillText('x1.4', 10, canvas.height - stepY * 1.5);
        ctx.fillText('x1.8', 10, canvas.height - stepY * 3.0);
        ctx.fillText('x2.2', 10, canvas.height - stepY * 4.2);

        // X Labels
        ctx.fillText('0s', 20, canvas.height - 5);
        ctx.fillText('4s', stepX * 2, canvas.height - 5);
        ctx.fillText('8s', stepX * 4, canvas.height - 5);
    }

    function drawCountdown() {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 36px Outfit';
        ctx.fillText('NEXT ROUND IN', canvas.width / 2, canvas.height / 2 - 25);

        ctx.fillStyle = 'var(--brandpurplelight)';
        ctx.font = 'bold 64px Outfit';
        ctx.fillText(`${countdown.toFixed(1)}s`, canvas.width / 2, canvas.height / 2 + 35);

        // Draw progress circle
        ctx.strokeStyle = 'rgba(157, 78, 221, 0.2)';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2 + 110, 20, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = 'var(--brandpurple)';
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2 + 110, 20, -Math.PI / 2, (countdown / 5.0) * Math.PI * 2 - Math.PI / 2);
        ctx.stroke();
    }

    function drawFlightPath(hasCrashed = false) {
        const startX = 50;
        const startY = canvas.height - 50;

        // Current position of plane
        const maxTime = 12.0; // limit visual X axis
        const progressX = Math.min(flightTime / maxTime, 0.9);
        const currentX = startX + (canvas.width - startX - 100) * progressX;
        
        // Multiplier scaling for Y axis
        const progressY = Math.min((currentMultiplier - 1.0) / 1.5, 0.8);
        const currentY = startY - (canvas.height - 100) * progressY;

        // Draw glowing red filled area under flight curve
        const gradient = ctx.createLinearGradient(0, startY, 0, currentY);
        if (hasCrashed) {
            gradient.addColorStop(0, 'rgba(120, 10, 10, 0.0)');
            gradient.addColorStop(1, 'rgba(120, 10, 10, 0.05)');
        } else {
            gradient.addColorStop(0, 'rgba(255, 0, 84, 0.0)');
            gradient.addColorStop(1, 'rgba(255, 0, 84, 0.25)');
        }
        ctx.fillStyle = gradient;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        // Draw quadratic curve
        ctx.quadraticCurveTo((startX + currentX) / 2, startY, currentX, currentY);
        ctx.lineTo(currentX, startY);
        ctx.closePath();
        ctx.fill();

        // Draw Red Line
        ctx.strokeStyle = hasCrashed ? 'rgba(180, 20, 20, 0.4)' : '#ff0054';
        ctx.lineWidth = 4;
        ctx.shadowColor = '#ff0054';
        ctx.shadowBlur = hasCrashed ? 0 : 15;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo((startX + currentX) / 2, startY, currentX, currentY);
        ctx.stroke();
        ctx.shadowBlur = 0; // reset shadow

        // Draw plane drawing shape
        drawPlaneIcon(currentX, currentY, hasCrashed);
    }

    function drawPlaneIcon(x, y, hasCrashed) {
        ctx.save();
        ctx.translate(x, y);
        
        // Tilt slightly upwards during flight
        const angle = hasCrashed ? Math.PI / 6 : -Math.PI / 16;
        ctx.rotate(angle);

        ctx.fillStyle = hasCrashed ? 'rgba(150, 40, 40, 0.8)' : '#ff0054';
        ctx.shadowColor = '#ff0054';
        ctx.shadowBlur = hasCrashed ? 0 : 20;

        // Custom polygon drawing representing a sleek propeller aircraft
        ctx.beginPath();
        ctx.moveTo(-18, -4);
        ctx.lineTo(0, -6);
        ctx.lineTo(15, -2);
        ctx.lineTo(18, 0);
        ctx.lineTo(15, 2);
        ctx.lineTo(0, 6);
        ctx.lineTo(-18, 4);
        ctx.lineTo(-16, 0);
        ctx.closePath();
        ctx.fill();

        // Wings
        ctx.beginPath();
        ctx.moveTo(-4, -6);
        ctx.lineTo(6, -22);
        ctx.lineTo(8, -22);
        ctx.lineTo(2, -6);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-4, 6);
        ctx.lineTo(6, 22);
        ctx.lineTo(8, 22);
        ctx.lineTo(2, 6);
        ctx.closePath();
        ctx.fill();

        // Propeller line
        if (!hasCrashed) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(18, -12);
            ctx.lineTo(18, 12);
            ctx.stroke();
        }

        ctx.restore();
    }

    function drawMultiplier() {
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 72px Outfit';
        ctx.fillText(`${currentMultiplier.toFixed(2)}x`, canvas.width / 2, canvas.height / 2);
    }

    function drawCrashed() {
        ctx.fillStyle = '#ff0054';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 48px Outfit';
        ctx.fillText('FLEW AWAY!', canvas.width / 2, canvas.height / 2 - 30);

        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = 'bold 64px Outfit';
        ctx.fillText(`${crashMultiplier.toFixed(2)}x`, canvas.width / 2, canvas.height / 2 + 35);
    }

    function renderHistory() {
        const row = document.getElementById('aviator-history-feed');
        if (!row) return;

        row.innerHTML = '';
        recentCrashes.forEach(val => {
            let badgeClass = 'bg-purple-950 text-purple-300 border-purple-900/50';
            if (val >= 2.0) badgeClass = 'bg-blue-950 text-blue-300 border-blue-900/50';
            if (val >= 10.0) badgeClass = 'bg-yellow-950 text-yellow-400 border-yellow-900/50';

            row.innerHTML += `
                <span class="px-2.5 py-1 text-xs font-mono font-bold rounded-lg border ${badgeClass}">${val.toFixed(2)}x</span>
            `;
        });
    }

    // Mock Live Bets Generation
    function generateMockPlayers() {
        mockPlayers = []; // no dummy players
    }

    function resetMockPlayers() {
        mockPlayers = [];
        renderLiveBets();
    }

    function updateMockPlayers(currentMult) {
        // No dummy player updates needed
    }

    function renderLiveBets() {
        const tableBody = document.getElementById('aviator-bets-table-body');
        if (!tableBody) return;

        tableBody.innerHTML = '';
        
        // Show count of active bets
        let activeCount = 0;

        // If user has an active bet in the current round, render it!
        if (userBet.isPlaced && STATE.user) {
            activeCount = 1;
            const hasCashedOut = userBet.isCashedOut;
            const coVal = hasCashedOut ? `${userBet.cashOutMultiplier.toFixed(2)}x` : '-';
            const winVal = hasCashedOut ? formatCurrency(userBet.amount * userBet.cashOutMultiplier) : '-';
            const coClass = hasCashedOut ? 'text-green-400 font-semibold bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-lg' : 'text-gray-500';
            const winClass = hasCashedOut ? 'text-green-400 font-semibold' : 'text-gray-400';

            tableBody.innerHTML = `
                <tr class="border-b border-purple-500/30 bg-purple-950/20 hover:bg-purple-950/30 transition duration-150 shadow-[0_0_10px_rgba(123,44,191,0.2)]">
                    <td class="px-4 py-2.5 whitespace-nowrap text-sm text-yellow-400 flex items-center space-x-2 font-bold">
                        <div class="h-6 w-6 rounded-full bg-yellow-500 flex items-center justify-center text-[10px] text-black font-bold border border-yellow-400/30">ME</div>
                        <span>${STATE.user.username} (You)</span>
                    </td>
                    <td class="px-4 py-2.5 whitespace-nowrap text-sm text-gray-200 font-semibold">${formatCurrency(userBet.amount)}</td>
                    <td class="px-4 py-2.5 whitespace-nowrap text-sm"><span class="${coClass}">${coVal}</span></td>
                    <td class="px-4 py-2.5 whitespace-nowrap text-sm ${winClass}">${winVal}</td>
                </tr>
            `;
        } else {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="px-4 py-8 text-center text-gray-500 text-sm">No bets placed in this round. Place your bet!</td>
                </tr>
            `;
        }

        // Update badge count
        const badge = document.getElementById('live-bet-count');
        if (badge) badge.innerText = activeCount;
    }

    return {
        init,
        cleanup
    };
})();

// Attach globally
window.AviatorGame = AviatorGame;
