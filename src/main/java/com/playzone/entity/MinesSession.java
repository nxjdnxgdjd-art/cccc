package com.playzone.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "mines_sessions")
public class MinesSession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "bet_amount", nullable = false)
    private BigDecimal betAmount;

    @Column(name = "mines_count", nullable = false)
    private Integer minesCount;

    @Column(name = "mine_locations", nullable = false)
    private String mineLocations; // Comma-separated grid indices (0-24) where mines are located, e.g., "3,11,21"

    @Column(name = "revealed_coordinates", nullable = false)
    private String revealedCoordinates = ""; // Comma-separated grid indices revealed, e.g., "1,5,10"

    @Column(name = "multiplier", nullable = false)
    private BigDecimal multiplier = BigDecimal.ONE;

    @Column(nullable = false)
    private String status = "ACTIVE"; // ACTIVE, CASHED_OUT, EXPLODED

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        if (this.revealedCoordinates == null) {
            this.revealedCoordinates = "";
        }
        if (this.multiplier == null) {
            this.multiplier = BigDecimal.ONE;
        }
        if (this.status == null) {
            this.status = "ACTIVE";
        }
    }

    public MinesSession() {}

    public MinesSession(User user, BigDecimal betAmount, Integer minesCount, String mineLocations) {
        this.user = user;
        this.betAmount = betAmount;
        this.minesCount = minesCount;
        this.mineLocations = mineLocations;
    }

    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }

    public BigDecimal getBetAmount() { return betAmount; }
    public void setBetAmount(BigDecimal betAmount) { this.betAmount = betAmount; }

    public Integer getMinesCount() { return minesCount; }
    public void setMinesCount(Integer minesCount) { this.minesCount = minesCount; }

    public String getMineLocations() { return mineLocations; }
    public void setMineLocations(String mineLocations) { this.mineLocations = mineLocations; }

    public String getRevealedCoordinates() { return revealedCoordinates; }
    public void setRevealedCoordinates(String revealedCoordinates) { this.revealedCoordinates = revealedCoordinates; }

    public BigDecimal getMultiplier() { return multiplier; }
    public void setMultiplier(BigDecimal multiplier) { this.multiplier = multiplier; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
