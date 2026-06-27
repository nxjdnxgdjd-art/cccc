package com.playzone.controller;

import com.playzone.entity.User;
import com.playzone.entity.MinesSession;
import com.playzone.entity.GameHistory;
import com.playzone.service.GameService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/games")
public class GameController {

    private final GameService gameService;

    public GameController(GameService gameService) {
        this.gameService = gameService;
    }

    @GetMapping("/history")
    public ResponseEntity<List<GameHistory>> getHistory(
            @RequestAttribute("currentUser") User user,
            @RequestParam(value = "gameType", required = false) String gameType) {
        List<GameHistory> history = gameService.getRecentGameHistory(user, gameType);
        return ResponseEntity.ok(history);
    }

    // --- AVIATOR ---

    @PostMapping("/aviator/bet")
    public ResponseEntity<?> placeAviatorBet(@RequestAttribute("currentUser") User user, @RequestBody Map<String, BigDecimal> request) {
        try {
            BigDecimal betAmount = request.get("betAmount");
            if (betAmount == null || betAmount.compareTo(BigDecimal.ZERO) <= 0) {
                return ResponseEntity.badRequest().body(Map.of("error", "Invalid bet amount"));
            }
            User updatedUser = gameService.placeAviatorBet(user, betAmount);
            return ResponseEntity.ok(updatedUser);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/aviator/cashout")
    public ResponseEntity<?> cashOutAviator(@RequestAttribute("currentUser") User user, @RequestBody Map<String, BigDecimal> request) {
        try {
            BigDecimal betAmount = request.get("betAmount");
            BigDecimal multiplier = request.get("multiplier");
            if (betAmount == null || multiplier == null || betAmount.compareTo(BigDecimal.ZERO) <= 0 || multiplier.compareTo(BigDecimal.ONE) < 0) {
                return ResponseEntity.badRequest().body(Map.of("error", "Invalid parameters"));
            }
            User updatedUser = gameService.cashOutAviator(user, betAmount, multiplier);
            return ResponseEntity.ok(updatedUser);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/aviator/loss")
    public ResponseEntity<?> recordAviatorLoss(@RequestAttribute("currentUser") User user, @RequestBody Map<String, BigDecimal> request) {
        try {
            BigDecimal betAmount = request.get("betAmount");
            if (betAmount == null || betAmount.compareTo(BigDecimal.ZERO) <= 0) {
                return ResponseEntity.badRequest().body(Map.of("error", "Invalid bet amount"));
            }
            gameService.recordAviatorLoss(user, betAmount);
            return ResponseEntity.ok(Map.of("message", "Loss recorded successfully"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    // --- MINES ---

    @PostMapping("/mines/start")
    public ResponseEntity<?> startMines(@RequestAttribute("currentUser") User user, @RequestBody Map<String, Object> request) {
        try {
            if (!request.containsKey("betAmount") || !request.containsKey("minesCount")) {
                return ResponseEntity.badRequest().body(Map.of("error", "betAmount and minesCount are required"));
            }
            BigDecimal betAmount = new BigDecimal(request.get("betAmount").toString());
            int minesCount = Integer.parseInt(request.get("minesCount").toString());

            if (betAmount.compareTo(BigDecimal.ZERO) <= 0) {
                return ResponseEntity.badRequest().body(Map.of("error", "Invalid bet amount"));
            }

            MinesSession session = gameService.startMinesGame(user, betAmount, minesCount);
            // Hide mine locations from response to prevent cheating!
            MinesSession safeSession = new MinesSession();
            safeSession.setId(session.getId());
            safeSession.setBetAmount(session.getBetAmount());
            safeSession.setMinesCount(session.getMinesCount());
            safeSession.setRevealedCoordinates("");
            safeSession.setMultiplier(session.getMultiplier());
            safeSession.setStatus(session.getStatus());
            safeSession.setCreatedAt(session.getCreatedAt());

            return ResponseEntity.ok(safeSession);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/mines/reveal")
    public ResponseEntity<?> revealMinesCell(@RequestAttribute("currentUser") User user, @RequestBody Map<String, Object> request) {
        try {
            if (!request.containsKey("sessionId") || !request.containsKey("cellIndex")) {
                return ResponseEntity.badRequest().body(Map.of("error", "sessionId and cellIndex are required"));
            }
            Long sessionId = Long.parseLong(request.get("sessionId").toString());
            int cellIndex = Integer.parseInt(request.get("cellIndex").toString());

            MinesSession session = gameService.revealCell(user, sessionId, cellIndex);

            // If game exploded, return full mine locations so client can display them.
            // If active, keep them hidden.
            if ("EXPLODED".equals(session.getStatus())) {
                return ResponseEntity.ok(session);
            } else {
                MinesSession safeSession = new MinesSession();
                safeSession.setId(session.getId());
                safeSession.setBetAmount(session.getBetAmount());
                safeSession.setMinesCount(session.getMinesCount());
                safeSession.setRevealedCoordinates(session.getRevealedCoordinates());
                safeSession.setMultiplier(session.getMultiplier());
                safeSession.setStatus(session.getStatus());
                safeSession.setCreatedAt(session.getCreatedAt());
                return ResponseEntity.ok(safeSession);
            }
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/mines/cashout")
    public ResponseEntity<?> cashOutMines(@RequestAttribute("currentUser") User user, @RequestBody Map<String, Object> request) {
        try {
            if (!request.containsKey("sessionId")) {
                return ResponseEntity.badRequest().body(Map.of("error", "sessionId is required"));
            }
            Long sessionId = Long.parseLong(request.get("sessionId").toString());

            Map<String, Object> response = gameService.cashOutMines(user, sessionId);
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }
}
