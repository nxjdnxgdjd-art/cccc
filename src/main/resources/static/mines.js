// PlayZone Mines (Mini Blast) Game Module

const MinesGame = (() => {
    let activeSession = null;
    let boardLocked = false;
    let revealedCells = new Set();
    let clickedMineIndex = null;

    function init() {
        bindUI();
        renderPayouts();
        resetBoard();
        loadGameHistory();
    }

    function bindUI() {
        // Quick Bet Buttons
        const quickBets = [10, 50, 100, 500, 1000];
        quickBets.forEach(val => {
            const btn = document.getElementById(`mines-quick-${val}`);
            if (btn) {
                btn.onclick = () => {
                    document.getElementById('mines-bet-amount').value = val;
                    updatePotentialWins();
                };
            }
        });

        const betAmtInput = document.getElementById('mines-bet-amount');
        if (betAmtInput) {
            betAmtInput.oninput = updatePotentialWins;
        }

        // Mines count selection change
        const selectMines = document.getElementById('mines-count-select');
        if (selectMines) {
            selectMines.onchange = () => {
                renderPayouts();
                updatePotentialWins();
            };
        }

        // Start Game button
        const startBtn = document.getElementById('mines-start-btn');
        if (startBtn) {
            startBtn.onclick = handleStartGame;
        }

        // Cash out button
        const cashoutBtn = document.getElementById('mines-cashout-btn');
        if (cashoutBtn) {
            cashoutBtn.onclick = handleCashOut;
        }

        // Create Grid Cells (5x5 = 25 tiles)
        const grid = document.getElementById('mines-grid');
        if (grid) {
            grid.innerHTML = '';
            for (let i = 0; i < 25; i++) {
                grid.innerHTML += `
                    <div id="mine-tile-${i}" class="mine-card w-full aspect-square cursor-pointer" onclick="MinesGame.handleTileClick(${i})">
                        <div class="mine-card-inner w-full h-full">
                            <!-- Front Side (unrevealed state) -->
                            <div class="mine-card-front w-full h-full flex items-center justify-center">
                                <div class="w-4 h-4 rounded-full bg-purple-950/40 border border-purple-500/30 shadow-[0_0_10px_rgba(123,44,191,0.2)]"></div>
                            </div>
                            <!-- Back Side (revealed state) -->
                            <div id="mine-tile-back-${i}" class="mine-card-back w-full h-full flex items-center justify-center bg-purple-950 border border-purple-900">
                                <!-- Will contain diamond or bomb -->
                            </div>
                        </div>
                    </div>
                `;
            }
        }
    }

    function calculateMultiplier(minesCount, safePicks) {
        if (safePicks <= 0) return 1.0;
        let rtp = 0.98; // matches server
        let probability = 1.0;
        let totalCells = 25;
        let safeCells = totalCells - minesCount;

        for (let i = 0; i < safePicks; i++) {
            probability *= (safeCells - i) / (totalCells - i);
        }

        return rtp / probability;
    }

    function renderPayouts() {
        const select = document.getElementById('mines-count-select');
        const list = document.getElementById('mines-possible-payouts');
        if (!select || !list) return;

        const minesCount = parseInt(select.value) || 3;
        const totalSafe = 25 - minesCount;

        list.innerHTML = '';
        // Render 5 relevant payouts
        const startPick = Math.max(1, totalSafe - 4);
        for (let pick = totalSafe; pick >= startPick; pick--) {
            const mult = calculateMultiplier(minesCount, pick);
            const picksLabel = `${pick} Safe Picks`;
            
            list.innerHTML += `
                <div id="payout-row-${pick}" class="flex justify-between items-center px-4 py-2 border-b border-purple-950/30 text-sm text-gray-400">
                    <span>${picksLabel}</span>
                    <span class="font-mono text-purple-300 font-semibold">${mult.toFixed(2)}x</span>
                </div>
            `;
        }
    }

    function highlightPayoutRow(safePicks) {
        // Remove active class from all rows
        const rows = document.querySelectorAll('[id^="payout-row-"]');
        rows.forEach(r => r.classList.remove('bg-purple-900/40', 'text-white'));

        const activeRow = document.getElementById(`payout-row-${safePicks}`);
        if (activeRow) {
            activeRow.classList.add('bg-purple-900/40', 'text-white');
        }
    }

    function updatePotentialWins() {
        const amtInput = document.getElementById('mines-bet-amount');
        const select = document.getElementById('mines-count-select');
        if (!amtInput || !select) return;

        const betAmt = parseFloat(amtInput.value) || 0;
        const minesCount = parseInt(select.value) || 3;

        // Default next multiplier
        const revealedCount = activeSession ? revealedCells.size : 0;
        const currentMult = revealedCount > 0 ? calculateMultiplier(minesCount, revealedCount) : 0;
        const nextMult = calculateMultiplier(minesCount, revealedCount + 1);

        document.getElementById('mines-next-payout').innerText = formatCurrency(betAmt * nextMult);

        if (activeSession) {
            document.getElementById('mines-stat-bet').innerText = formatCurrency(activeSession.betAmount);
            document.getElementById('mines-stat-multiplier').innerText = `${currentMult.toFixed(2)}x`;
            document.getElementById('mines-stat-win').innerText = formatCurrency(activeSession.betAmount * currentMult);
        } else {
            document.getElementById('mines-stat-bet').innerText = formatCurrency(betAmt);
            document.getElementById('mines-stat-multiplier').innerText = '0.00x';
            document.getElementById('mines-stat-win').innerText = '₹0.00';
        }
    }

    function resetBoard() {
        revealedCells.clear();
        clickedMineIndex = null;
        boardLocked = false;

        for (let i = 0; i < 25; i++) {
            const tile = document.getElementById(`mine-tile-${i}`);
            if (tile) {
                tile.classList.remove('is-revealed');
                // Reset back content
                const back = document.getElementById(`mine-tile-back-${i}`);
                if (back) {
                    back.innerHTML = '';
                    back.className = "mine-card-back w-full h-full flex items-center justify-center bg-purple-950 border border-purple-900";
                }
            }
        }

        updatePotentialWins();
    }

    async function handleStartGame() {
        const amtInput = document.getElementById('mines-bet-amount');
        const select = document.getElementById('mines-count-select');
        if (!amtInput || !select) return;

        const betAmount = parseFloat(amtInput.value);
        const minesCount = parseInt(select.value);

        if (isNaN(betAmount) || betAmount <= 0) {
            alert("Please enter a valid bet amount.");
            return;
        }

        if (betAmount > STATE.user.walletBalance) {
            alert("Insufficient wallet balance.");
            return;
        }

        const startBtn = document.getElementById('mines-start-btn');
        startBtn.disabled = true;
        startBtn.innerHTML = `<div class="spinner mx-auto"></div>`;

        try {
            const response = await apiCall('/api/games/mines/start', 'POST', { betAmount, minesCount });
            activeSession = response;
            resetBoard();

            // Enable game controls
            document.getElementById('mines-cashout-btn').disabled = false;
            document.getElementById('mines-cashout-text').innerText = formatCurrency(0);
            
            // Lock inputs
            amtInput.disabled = true;
            select.disabled = true;
            startBtn.classList.add('hidden');
            document.getElementById('mines-cashout-btn').classList.remove('hidden');

            addNotification(`Mines game started! Bet: ${formatCurrency(betAmount)}`);
            // Sync user balance display (bet deducted)
            loadUserProfile();
            updatePotentialWins();
            playSynthSound(440, 0.15, 'sine');
        } catch (err) {
            alert(err.message || "Failed to start game.");
        } finally {
            startBtn.disabled = false;
            startBtn.innerHTML = `Start New Game`;
        }
    }

    async function handleTileClick(index) {
        if (!activeSession || boardLocked || revealedCells.has(index)) return;

        boardLocked = true;

        try {
            const response = await apiCall('/api/games/mines/reveal', 'POST', {
                sessionId: activeSession.id,
                cellIndex: index
            });

            if (response.status === 'EXPLODED') {
                // Clicked bomb! Boom!
                clickedMineIndex = index;
                activeSession = null;
                revealMinesBoard(response.mineLocations);
                playSynthSound(100, 0.6, 'sawtooth'); // explosion sound
                
                // End game UI resets
                setTimeout(() => {
                    resetGameControls();
                    loadGameHistory();
                    loadUserProfile();
                }, 3000);
            } else {
                // Safe diamond
                activeSession = response;
                revealedCells.add(index);
                const tile = document.getElementById(`mine-tile-${index}`);
                const back = document.getElementById(`mine-tile-back-${index}`);
                
                back.innerHTML = `
                    <svg class="w-8 h-8 text-blue-400 drop-shadow-[0_0_8px_rgba(0,240,255,0.7)]" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2L2 9l10 13 10-13-10-7zm0 3.54L17.7 9H6.3L12 5.54zM6.57 11h10.86L12 19.34 6.57 11z"/>
                    </svg>
                `;
                back.className = "mine-card-back w-full h-full flex items-center justify-center bg-blue-950 border border-blue-400 shadow-[0_0_10px_rgba(0,240,255,0.3)]";
                tile.classList.add('is-revealed');
                
                // Update multiplier/win display
                const safePicks = revealedCells.size;
                const select = document.getElementById('mines-count-select');
                const minesCount = parseInt(select.value) || 3;
                const mult = calculateMultiplier(minesCount, safePicks);

                document.getElementById('mines-cashout-text').innerText = formatCurrency(response.betAmount * mult);
                document.getElementById('mines-stat-multiplier').innerText = `${mult.toFixed(2)}x`;
                document.getElementById('mines-stat-win').innerText = formatCurrency(response.betAmount * mult);
                
                // Highlight corresponding row
                const totalSafe = 25 - minesCount;
                highlightPayoutRow(totalSafe - safePicks);

                playSynthSound(600 + safePicks * 80, 0.12, 'sine'); // scaling win sound
                updatePotentialWins();
                boardLocked = false;
            }
        } catch (err) {
            alert(err.message || "Failed to reveal tile.");
            boardLocked = false;
        }
    }

    async function handleCashOut() {
        if (!activeSession || boardLocked || revealedCells.size === 0) return;

        boardLocked = true;
        const cashoutBtn = document.getElementById('mines-cashout-btn');
        cashoutBtn.disabled = true;

        try {
            const response = await apiCall('/api/games/mines/cashout', 'POST', {
                sessionId: activeSession.id
            });

            // Play cashout sound
            playSynthSound(523.25, 0.15, 'triangle');
            setTimeout(() => playSynthSound(659.25, 0.2, 'triangle'), 100);

            // Sync user balance
            STATE.user.walletBalance = response.walletBalance;
            syncBalanceDisplays(response.walletBalance);

            // Reveal board mine positions
            activeSession = null;
            revealMinesBoard(response.session.mineLocations, response.session.revealedCoordinates);

            addNotification(`Mines Cash Out! Won ${formatCurrency(response.winAmount)}`);

            setTimeout(() => {
                resetGameControls();
                loadGameHistory();
                loadUserProfile();
            }, 3000);

        } catch (err) {
            alert(err.message || "Cash out failed.");
            cashoutBtn.disabled = false;
            boardLocked = false;
        }
    }

    function revealMinesBoard(minesStr, revealedStr = "") {
        boardLocked = true;
        
        const minesList = parseList(minesStr);
        const revealedList = parseList(revealedStr);

        for (let i = 0; i < 25; i++) {
            const tile = document.getElementById(`mine-tile-${i}`);
            const back = document.getElementById(`mine-tile-back-${i}`);

            if (minesList.includes(i)) {
                // If it is a bomb
                if (i === clickedMineIndex) {
                    // This was the trigger bomb
                    back.innerHTML = `
                        <svg class="w-8 h-8 text-red-500 animate-bounce drop-shadow-[0_0_12px_rgba(255,0,84,0.9)]" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2c-5.52 0-10 4.48-10 10s4.48 10 10 10 10-4.48 10-10-4.48-10-10-10zm1 14h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                        </svg>
                    `;
                    back.className = "mine-card-back w-full h-full flex items-center justify-center bg-red-950 border border-red-500 shadow-[0_0_15px_rgba(255,0,84,0.5)]";
                } else {
                    // Regular faded bomb
                    back.innerHTML = `
                        <svg class="w-6 h-6 text-red-700/60" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2c-5.52 0-10 4.48-10 10s4.48 10 10 10 10-4.48 10-10-4.48-10-10-10zm1 14h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                        </svg>
                    `;
                    back.className = "mine-card-back w-full h-full flex items-center justify-center bg-purple-950/20 border border-red-950/30";
                }
                tile.classList.add('is-revealed');
            } else if (!revealedList.includes(i) && !revealedCells.has(i)) {
                // Faded unselected diamond
                back.innerHTML = `
                    <svg class="w-6 h-6 text-blue-900/40" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2L2 9l10 13 10-13-10-7zm0 3.54L17.7 9H6.3L12 5.54zM6.57 11h10.86L12 19.34 6.57 11z"/>
                    </svg>
                `;
                back.className = "mine-card-back w-full h-full flex items-center justify-center bg-purple-950/10 border border-purple-950/20";
                tile.classList.add('is-revealed');
            }
        }
    }

    function resetGameControls() {
        document.getElementById('mines-bet-amount').disabled = false;
        document.getElementById('mines-count-select').disabled = false;
        
        document.getElementById('mines-start-btn').classList.remove('hidden');
        document.getElementById('mines-cashout-btn').classList.add('hidden');
        
        // Remove payout rows highlights
        const rows = document.querySelectorAll('[id^="payout-row-"]');
        rows.forEach(r => r.classList.remove('bg-purple-900/40', 'text-white'));

        resetBoard();
    }

    async function loadGameHistory() {
        try {
            const history = await apiCall('/api/games/history?gameType=MINES');
            const body = document.getElementById('mines-history-table-body');
            if (!body) return;

            body.innerHTML = '';
            if (history.length === 0) {
                body.innerHTML = `<tr><td colspan="5" class="py-3 text-center text-gray-500 text-xs">No rounds played yet</td></tr>`;
                return;
            }

            // Display first 4 items
            history.slice(0, 4).forEach(h => {
                const date = new Date(h.createdAt);
                const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const winAmt = h.winAmount > 0 ? formatCurrency(h.winAmount) : '-';
                const multStr = h.winAmount > 0 ? `${h.multiplier.toFixed(2)}x` : '-';
                const winClass = h.winAmount > 0 ? 'text-green-400 font-semibold' : 'text-gray-500';

                body.innerHTML += `
                    <tr class="border-b border-purple-950/20 hover:bg-purple-950/10 transition text-xs">
                        <td class="px-4 py-2 text-gray-400 font-mono">${timeStr}</td>
                        <td class="px-4 py-2 text-gray-300">3</td>
                        <td class="px-4 py-2 text-gray-300">${formatCurrency(h.betAmount)}</td>
                        <td class="px-4 py-2 text-purple-300 font-medium">${multStr}</td>
                        <td class="px-4 py-2 ${winClass}">${winAmt}</td>
                    </tr>
                `;
            });
        } catch (err) {
            console.error("Failed to load mines game history:", err.message);
        }
    }

    function playSynthSound(freq, duration, type = 'sine') {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            osc.type = type;
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            osc.connect(gain);
            gain.connect(audioCtx.destination);

            gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

            osc.start();
            osc.stop(audioCtx.currentTime + duration);
        } catch (e) {}
    }

    function parseList(str) {
        if (!str || str.trim() === "") return [];
        return str.split(',').map(Number);
    }

    return {
        init,
        handleTileClick
    };
})();

// Attach globally
window.MinesGame = MinesGame;
