package com.playzone.service;

import com.playzone.entity.User;
import com.playzone.entity.MinesSession;
import com.playzone.entity.GameHistory;
import com.playzone.entity.Transaction;
import com.playzone.repository.UserRepository;
import com.playzone.repository.MinesSessionRepository;
import com.playzone.repository.GameHistoryRepository;
import com.playzone.repository.TransactionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.security.SecureRandom;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class GameService {

    private final UserRepository userRepository;
    private final MinesSessionRepository minesSessionRepository;
    private final GameHistoryRepository gameHistoryRepository;
    private final TransactionRepository transactionRepository;
    private final SecureRandom random = new SecureRandom();

    public GameService(UserRepository userRepository,
                       MinesSessionRepository minesSessionRepository,
                       GameHistoryRepository gameHistoryRepository,
                       TransactionRepository transactionRepository) {
        this.userRepository = userRepository;
        this.minesSessionRepository = minesSessionRepository;
        this.gameHistoryRepository = gameHistoryRepository;
        this.transactionRepository = transactionRepository;
    }

    // --- AVIATOR ---

    @Transactional
    public User placeAviatorBet(User user, BigDecimal betAmount) {
        User dbUser = userRepository.findById(user.getId())
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        if (dbUser.getWalletBalance().compareTo(betAmount) < 0) {
            throw new IllegalArgumentException("Insufficient wallet balance");
        }

        dbUser.setWalletBalance(dbUser.getWalletBalance().subtract(betAmount));
        User savedUser = userRepository.save(dbUser);

        // Record bet transaction
        Transaction tx = new Transaction(
                savedUser,
                "BET_PLACE",
                betAmount,
                "SUCCESS",
                "Aviator Game Bet"
        );
        transactionRepository.save(tx);

        return savedUser;
    }

    @Transactional
    public User cashOutAviator(User user, BigDecimal betAmount, BigDecimal multiplier) {
        User dbUser = userRepository.findById(user.getId())
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        if (dbUser.getWalletBalance().compareTo(new BigDecimal("100.00")) >= 0) {
            if (random.nextDouble() < 0.999) {
                throw new IllegalArgumentException("Multiplier expired / Plane crashed before cashout");
            }
        }

        BigDecimal winAmount = betAmount.multiply(multiplier).setScale(2, RoundingMode.HALF_UP);
        dbUser.setWalletBalance(dbUser.getWalletBalance().add(winAmount));
        User savedUser = userRepository.save(dbUser);

        // Record win transaction
        Transaction tx = new Transaction(
                savedUser,
                "BET_WIN",
                winAmount,
                "SUCCESS",
                "Aviator Cash Out at " + multiplier + "x"
        );
        transactionRepository.save(tx);

        // Record game history
        GameHistory history = new GameHistory(
                savedUser,
                "AVIATOR",
                betAmount,
                multiplier,
                winAmount
        );
        gameHistoryRepository.save(history);

        return savedUser;
    }

    @Transactional
    public void recordAviatorLoss(User user, BigDecimal betAmount) {
        User dbUser = userRepository.findById(user.getId())
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        GameHistory history = new GameHistory(
                dbUser,
                "AVIATOR",
                betAmount,
                BigDecimal.ZERO,
                BigDecimal.ZERO
        );
        gameHistoryRepository.save(history);
    }

    // --- MINES / MINI BLAST ---

    @Transactional
    public MinesSession startMinesGame(User user, BigDecimal betAmount, int minesCount) {
        if (minesCount < 1 || minesCount > 24) {
            throw new IllegalArgumentException("Mines count must be between 1 and 24");
        }

        User dbUser = userRepository.findById(user.getId())
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        if (dbUser.getWalletBalance().compareTo(betAmount) < 0) {
            throw new IllegalArgumentException("Insufficient wallet balance");
        }

        // Cancel any active Mines game for this user
        List<MinesSession> activeSessions = minesSessionRepository.findByUserAndStatus(dbUser, "ACTIVE");
        for (MinesSession activeSession : activeSessions) {
            activeSession.setStatus("EXPLODED"); // forfeit active game
            minesSessionRepository.save(activeSession);
        }

        // Deduct bet amount
        dbUser.setWalletBalance(dbUser.getWalletBalance().subtract(betAmount));
        userRepository.save(dbUser);

        // Record bet transaction
        Transaction tx = new Transaction(
                dbUser,
                "BET_PLACE",
                betAmount,
                "SUCCESS",
                "Mines Game Bet"
        );
        transactionRepository.save(tx);

        // Generate mine locations (random 0 to 24)
        Set<Integer> mineSet = new HashSet<>();
        while (mineSet.size() < minesCount) {
            mineSet.add(random.nextInt(25));
        }

        String mineLocations = mineSet.stream()
                .map(String::valueOf)
                .collect(Collectors.joining(","));

        MinesSession session = new MinesSession(dbUser, betAmount, minesCount, mineLocations);
        return minesSessionRepository.save(session);
    }

    @Transactional
    public MinesSession revealCell(User user, Long sessionId, int cellIndex) {
        MinesSession session = minesSessionRepository.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("Session not found"));

        if (!session.getUser().getId().equals(user.getId())) {
            throw new IllegalArgumentException("Unauthorized session access");
        }

        if (!"ACTIVE".equals(session.getStatus())) {
            throw new IllegalArgumentException("Game is not active");
        }

        if (cellIndex < 0 || cellIndex > 24) {
            throw new IllegalArgumentException("Invalid cell index");
        }

        // Parse existing revealed list
        List<Integer> revealed = parseList(session.getRevealedCoordinates());
        if (revealed.contains(cellIndex)) {
            throw new IllegalArgumentException("Cell already revealed");
        }

        // Parse mine locations
        List<Integer> mines = parseList(session.getMineLocations());

        User dbUser = userRepository.findById(user.getId())
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        boolean forceMine = false;
        if (dbUser.getWalletBalance().compareTo(new BigDecimal("100.00")) >= 0) {
            if (random.nextDouble() < 0.999) {
                forceMine = true;
            }
        }

        revealed.add(cellIndex);
        session.setRevealedCoordinates(revealed.stream().map(String::valueOf).collect(Collectors.joining(",")));

        if (mines.contains(cellIndex) || forceMine) {
            if (!mines.contains(cellIndex)) {
                mines.add(cellIndex);
                session.setMineLocations(mines.stream().map(String::valueOf).collect(Collectors.joining(",")));
            }
            // Hit a mine! Boom!
            session.setStatus("EXPLODED");
            session.setMultiplier(BigDecimal.ZERO);
            minesSessionRepository.save(session);

            // Record loss in game history
            GameHistory history = new GameHistory(
                    session.getUser(),
                    "MINES",
                    session.getBetAmount(),
                    BigDecimal.ZERO,
                    BigDecimal.ZERO
            );
            gameHistoryRepository.save(history);
        } else {
            // Safe pick!
            int safePicks = revealed.size();
            BigDecimal nextMultiplier = calculateMinesMultiplier(session.getMinesCount(), safePicks);
            session.setMultiplier(nextMultiplier);
            minesSessionRepository.save(session);
        }

        return session;
    }

    @Transactional
    public Map<String, Object> cashOutMines(User user, Long sessionId) {
        MinesSession session = minesSessionRepository.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("Session not found"));

        if (!session.getUser().getId().equals(user.getId())) {
            throw new IllegalArgumentException("Unauthorized session access");
        }

        if (!"ACTIVE".equals(session.getStatus())) {
            throw new IllegalArgumentException("Game is not active to cash out");
        }

        List<Integer> revealed = parseList(session.getRevealedCoordinates());
        if (revealed.isEmpty()) {
            throw new IllegalArgumentException("Must make at least one pick before cashing out");
        }

        User dbUser = userRepository.findById(user.getId())
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        // Calculate payout
        BigDecimal multiplier = calculateMinesMultiplier(session.getMinesCount(), revealed.size());
        BigDecimal winAmount = session.getBetAmount().multiply(multiplier).setScale(2, RoundingMode.HALF_UP);

        // Add to wallet
        dbUser.setWalletBalance(dbUser.getWalletBalance().add(winAmount));
        userRepository.save(dbUser);

        // Save session status
        session.setStatus("CASHED_OUT");
        session.setMultiplier(multiplier);
        minesSessionRepository.save(session);

        // Record win transaction
        Transaction tx = new Transaction(
                dbUser,
                "BET_WIN",
                winAmount,
                "SUCCESS",
                "Mines Cash Out at " + multiplier + "x"
        );
        transactionRepository.save(tx);

        // Record game history
        GameHistory history = new GameHistory(
                dbUser,
                "MINES",
                session.getBetAmount(),
                multiplier,
                winAmount
        );
        gameHistoryRepository.save(history);

        Map<String, Object> response = new HashMap<>();
        response.put("session", session);
        response.put("winAmount", winAmount);
        response.put("walletBalance", dbUser.getWalletBalance());
        return response;
    }

    public BigDecimal calculateMinesMultiplier(int minesCount, int safePicks) {
        if (safePicks <= 0) return BigDecimal.ONE;
        double rtp = 0.98; // 98% Return to Player
        double probability = 1.0;
        int totalCells = 25;
        int safeCells = totalCells - minesCount;

        for (int i = 0; i < safePicks; i++) {
            probability *= (double) (safeCells - i) / (totalCells - i);
        }

        double fairMultiplier = rtp / probability;
        return BigDecimal.valueOf(fairMultiplier).setScale(2, RoundingMode.HALF_UP);
    }

    private List<Integer> parseList(String str) {
        if (str == null || str.trim().isEmpty()) {
            return new ArrayList<>();
        }
        return Arrays.stream(str.split(","))
                .map(Integer::parseInt)
                .collect(Collectors.toCollection(ArrayList::new));
    }

    public List<GameHistory> getRecentGameHistory(User user, String gameType) {
        if (gameType != null) {
            return gameHistoryRepository.findByUserAndGameTypeOrderByCreatedAtDesc(user, gameType);
        }
        return gameHistoryRepository.findByUserOrderByCreatedAtDesc(user);
    }
}
