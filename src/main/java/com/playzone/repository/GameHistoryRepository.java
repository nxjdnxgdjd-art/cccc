package com.playzone.repository;

import com.playzone.entity.GameHistory;
import com.playzone.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface GameHistoryRepository extends JpaRepository<GameHistory, Long> {
    List<GameHistory> findByUserOrderByCreatedAtDesc(User user);
    List<GameHistory> findByUserAndGameTypeOrderByCreatedAtDesc(User user, String gameType);
    List<GameHistory> findFirst10ByGameTypeOrderByCreatedAtDesc(String gameType);
}
