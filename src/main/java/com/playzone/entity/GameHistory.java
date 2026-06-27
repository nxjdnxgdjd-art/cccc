package com.playzone.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "game_history")
public class GameHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "game_type", nullable = false)
    private String gameType; // AVIATOR, MINES

    @Column(name = "bet_amount", nullable = false)
    private BigDecimal betAmount;

    @Column(nullable = false)
    private BigDecimal multiplier;

    @Column(name = "win_amount", nullable = false)
    private BigDecimal winAmount;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }

    public GameHistory() {}

    public GameHistory(User user, String gameType, BigDecimal betAmount, BigDecimal multiplier, BigDecimal winAmount) {
        this.user = user;
        this.gameType = gameType;
        this.betAmount = betAmount;
        this.multiplier = multiplier;
        this.winAmount = winAmount;
    }

    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }

    public String getGameType() { return gameType; }
    public void setGameType(String gameType) { this.gameType = gameType; }

    public BigDecimal getBetAmount() { return betAmount; }
    public void setBetAmount(BigDecimal betAmount) { this.betAmount = betAmount; }

    public BigDecimal getMultiplier() { return multiplier; }
    public void setMultiplier(BigDecimal multiplier) { this.multiplier = multiplier; }

    public BigDecimal getWinAmount() { return winAmount; }
    public void setWinAmount(BigDecimal winAmount) { this.winAmount = winAmount; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
