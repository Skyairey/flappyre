import React, { useState, useEffect, useCallback } from "react";
import {
  leaderboardAPI,
  LeaderboardEntry as SupabaseLeaderboardEntry,
} from "./lib/supabase";

// --- Type Definitions ---
interface BirdProps {
  top: number;
  rotation: number;
}

interface ObstacleProps {
  x: number;
  height: number;
  isTop: boolean;
}

interface CoinProps {
  x: number;
  y: number;
  collected: boolean;
}

interface Coin {
  id: number;
  x: number;
  y: number;
  collected: boolean;
}

// --- Constants ---
const BIRD_SIZE = 70;
const GAME_WIDTH = 500;
const GAME_HEIGHT = 500;
const GRAVITY = 6;
const JUMP_HEIGHT = 100;
const OBSTACLE_WIDTH = 60;
const OBSTACLE_GAP = 200; // Gap between top and bottom obstacles
const OBSTACLE_SPEED = 6; // Speed obstacles move left
const COIN_SIZE = 20;
const COIN_SPAWN_RATE = 1; // Probability of spawning a coin (70%)

// --- Bird Component ---
// All styles are now inline
const Bird: React.FC<BirdProps> = (
  { top, rotation } // <-- Added 'rotation' prop
) => (
  <img
    src={process.env.PUBLIC_URL + "/bird_no_bg.svg"}
    alt="Bird"
    draggable={false}
    style={{
      position: "absolute",
      width: `${BIRD_SIZE}px`,
      height: `${BIRD_SIZE}px`,
      top: `${top}px`,
      left: "100px", // Bird's horizontal position is fixed
      transform: `rotate(${rotation}deg)`, // <-- Apply rotation
      transition: "top 0.1s linear, transform 0.1s linear", // <-- Smooth rotation and faster fall
      userSelect: "none", // Make image non-selectable
      pointerEvents: "none", // Prevent any pointer interactions
      objectFit: "contain", // Maintain aspect ratio
    }}
  />
);

// --- Obstacle Component ---
const Obstacle: React.FC<ObstacleProps> = ({ x, height, isTop }) => (
  <div
    style={{
      position: "absolute",
      width: `${OBSTACLE_WIDTH}px`,
      height: `${height}px`,
      left: `${x}px`,
      ...(isTop ? { top: 0 } : { bottom: 0 }),
      // Add a "cap" to the pipes
      display: "flex",
      flexDirection: isTop ? "column-reverse" : "column",
      // Tailwind styles converted:
      backgroundColor: "#16a34a", // bg-green-600
      border: "4px solid #14532d", // border-4 border-green-800
      borderRadius: "6px", // rounded-md
    }}
  >
    <div
      style={{
        width: "100%", // w-full
        height: "24px", // h-6
        backgroundColor: "#15803d", // bg-green-700
        borderTop: "4px solid #14532d", // border-y-4 border-green-800
        borderBottom: "4px solid #14532d",
      }}
    ></div>
  </div>
);

// --- Dappies Component ---
const CoinComponent: React.FC<CoinProps> = ({ x, y, collected }) => {
  if (collected) return null;

  return (
    <img
      src={process.env.PUBLIC_URL + "/dappies.svg"}
      alt="Dappies"
      style={{
        position: "absolute",
        width: `${COIN_SIZE}px`,
        height: `${COIN_SIZE}px`,
        left: `${x}px`,
        top: `${y}px`,
        animation: "coinSpin 1s linear infinite",
        pointerEvents: "none",
      }}
    />
  );
};

// --- Loading Bird Component ---
const LoadingBird: React.FC = () => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "16px",
    }}
  >
    <div
      style={{
        position: "relative",
        animation: "birdJump 0.8s ease-in-out infinite",
      }}
    >
      <img
        src={process.env.PUBLIC_URL + "/doose.svg"}
        alt="Loading Bird"
        draggable={false}
        style={{
          width: "40px",
          height: "40px",
          userSelect: "none",
          pointerEvents: "none",
          objectFit: "contain",
        }}
      />
    </div>
    <p
      style={{
        color: "#9ca3af",
        fontSize: "1rem",
        fontWeight: "500",
        textAlign: "center",
        margin: 0,
        animation: "pulse 1.5s ease-in-out infinite",
      }}
    >
      Loading...
    </p>
  </div>
);

// --- Main App Component ---
export default function App() {
  const [birdPosition, setBirdPosition] = useState(GAME_HEIGHT / 2);
  const [birdRotation, setBirdRotation] = useState(0); // <-- New state for rotation
  const [gameHasStarted, setGameHasStarted] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [score, setScore] = useState(0); // Timer-based score in milliseconds
  const [gameStartTime, setGameStartTime] = useState<number | null>(null);

  // Obstacle State
  const [obstaclePosition, setObstaclePosition] = useState(GAME_WIDTH);
  const [obstacleHeight, setObstacleHeight] = useState(150); // Height of the *top* obstacle

  // Coin State
  const [coins, setCoins] = useState<Coin[]>([]);
  const [coinsCollected, setCoinsCollected] = useState(0);
  const [nextCoinId, setNextCoinId] = useState(1);

  // Leaderboard State
  const [playerName, setPlayerName] = useState("");
  const [hasEnteredName, setHasEnteredName] = useState(false);
  const [leaderboard, setLeaderboard] = useState<SupabaseLeaderboardEntry[]>(
    []
  );
  const [showNameInput, setShowNameInput] = useState(true);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(false);
  const [scoreMessage, setScoreMessage] = useState<string | null>(null);

  // Rate limiting state
  const [lastScoreSubmission, setLastScoreSubmission] = useState<number>(0);
  const [submissionCooldown, setSubmissionCooldown] = useState<boolean>(false);
  const [scoreSavedThisSession, setScoreSavedThisSession] =
    useState<boolean>(false);

  // State for button hover
  const [isHovering, setIsHovering] = useState(false);

  // Mobile responsiveness and leaderboard modal state
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);

  // --- Helper function to format time ---
  const formatTime = (milliseconds: number): string => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const ms = Math.floor((milliseconds % 1000) / 10); // Get centiseconds (2 digits)
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;

    if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, "0")}.${ms
        .toString()
        .padStart(2, "0")}`;
    } else {
      return `${secs}.${ms.toString().padStart(2, "0")}s`;
    }
  };

  // --- Timer-based Scoring ---
  useEffect(() => {
    let timerInterval: NodeJS.Timeout;

    if (gameHasStarted && !isGameOver) {
      // Set the start time when game begins
      if (gameStartTime === null) {
        setGameStartTime(Date.now());
      }

      // Update score every 10ms for smooth millisecond display
      timerInterval = setInterval(() => {
        if (gameStartTime !== null) {
          const currentTime = Date.now();
          const elapsedMilliseconds = currentTime - gameStartTime;
          setScore(elapsedMilliseconds);
        }
      }, 10);
    }

    return () => clearInterval(timerInterval);
  }, [gameHasStarted, isGameOver, gameStartTime]);

  // --- Load Leaderboard from Supabase ---
  const loadLeaderboard = useCallback(async () => {
    console.log("📊 Loading leaderboard...");
    setIsLoadingLeaderboard(true);
    try {
      const data = await leaderboardAPI.getLeaderboard();
      console.log("📊 Leaderboard data received:", data.length, "entries");
      console.log("📊 Raw leaderboard data:", data);
      setLeaderboard(data);
    } catch (error) {
      console.error("Failed to load leaderboard:", error);
    } finally {
      setIsLoadingLeaderboard(false);
    }
  }, []);

  useEffect(() => {
    loadLeaderboard();

    // Load saved player name from localStorage
    const savedName = localStorage.getItem("flappyLawrencePlayerName");
    if (savedName) {
      setPlayerName(savedName);
      setHasEnteredName(true);
      setShowNameInput(false);
    }

    // Set up real-time subscription
    console.log("🔄 Setting up real-time leaderboard subscription...");
    const subscription = leaderboardAPI.subscribeToLeaderboard(
      (updatedLeaderboard: SupabaseLeaderboardEntry[]) => {
        console.log(
          "🔄 Real-time update received:",
          updatedLeaderboard.length,
          "entries"
        );
        console.log("📊 Updated leaderboard data:", updatedLeaderboard);
        setLeaderboard(updatedLeaderboard);
      }
    );

    return () => {
      leaderboardAPI.unsubscribe(subscription);
    };
  }, [loadLeaderboard]);

  // Debug: Log whenever leaderboard state changes
  useEffect(() => {
    console.log("🎯 Leaderboard state updated:", leaderboard.length, "entries");
    console.log("🎯 Current leaderboard state:", leaderboard);
  }, [leaderboard]);

  // Handle window resize for mobile responsiveness
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // --- Save score to Supabase leaderboard ---
  const saveScoreToLeaderboard = useCallback(async () => {
    if (playerName.trim() === "") return;

    console.log("💾 Attempting to save score:", {
      playerName: playerName.trim(),
      score: score,
      coinsCollected: coinsCollected,
    });

    // Rate limiting: Prevent submissions more than once every 3 seconds
    const now = Date.now();
    const COOLDOWN_PERIOD = 3000; // 3 seconds

    if (submissionCooldown || now - lastScoreSubmission < COOLDOWN_PERIOD) {
      console.log("Rate limited: Please wait before submitting another score");
      return;
    }

    setSubmissionCooldown(true);
    setLastScoreSubmission(now);

    try {
      // Get user's current best score first
      const userBest = await leaderboardAPI.getUserBestScore(playerName.trim());
      console.log("🏆 User best score:", userBest);

      const success = await leaderboardAPI.saveScore(
        playerName.trim(),
        score,
        coinsCollected
      );

      if (success) {
        console.log("✅ Score saved successfully to database");
        if (userBest && score > userBest) {
          setScoreMessage("New personal best! 🎉");
          console.log("🎉 New personal best achieved!");
          // Clear message after 3 seconds
          setTimeout(() => setScoreMessage(null), 3000);
        }
        // Refresh leaderboard after saving
        console.log("🔄 Refreshing leaderboard...");
        // Add a small delay to ensure database consistency
        await new Promise((resolve) => setTimeout(resolve, 500));
        await loadLeaderboard();

        // Clean up any duplicate entries for this user
        await leaderboardAPI.cleanupDuplicates(playerName.trim());

        // Refresh again after cleanup
        await loadLeaderboard();
        console.log("✅ Leaderboard refresh completed");
      } else {
        console.log("❌ Failed to save score");
      }
    } catch (error) {
      console.error("Failed to save score:", error);
    } finally {
      // Reset cooldown after operation completes
      setTimeout(() => setSubmissionCooldown(false), COOLDOWN_PERIOD);
    }
  }, [
    playerName,
    score,
    coinsCollected,
    loadLeaderboard,
    submissionCooldown,
    lastScoreSubmission,
  ]);

  // --- Handle name submission ---
  const handleNameSubmit = () => {
    // Validate and sanitize name input
    const sanitizedName = playerName.trim().replace(/[<>]/g, ""); // Remove potential XSS characters

    // Validation checks
    if (sanitizedName === "") {
      alert("Please enter a valid name");
      return;
    }

    if (sanitizedName.length < 2) {
      alert("Name must be at least 2 characters long");
      return;
    }

    if (sanitizedName.length > 20) {
      alert("Name must be 20 characters or less");
      return;
    }

    // Check for inappropriate patterns
    const inappropriatePattern = /^(admin|null|undefined|test|bot|system)$/i;
    if (inappropriatePattern.test(sanitizedName)) {
      alert("Please choose a different name");
      return;
    }

    // Save sanitized name to localStorage for future sessions
    localStorage.setItem("flappyLawrencePlayerName", sanitizedName);
    setPlayerName(sanitizedName); // Update state with sanitized name
    setHasEnteredName(true);
    setShowNameInput(false);
  };

  // --- Game Loop ---
  useEffect(() => {
    let gameLoopInterval: NodeJS.Timeout;
    if (gameHasStarted && !isGameOver) {
      gameLoopInterval = setInterval(() => {
        // --- Gravity ---
        setBirdPosition((prev) => {
          const newPos = prev + GRAVITY;
          return newPos > GAME_HEIGHT - BIRD_SIZE
            ? GAME_HEIGHT - BIRD_SIZE
            : newPos;
        });

        // --- Bird Tilt ---
        setBirdRotation((prev) => Math.min(prev + 4, 90)); // <-- Tilt down, max 90 deg

        // --- Move Obstacle ---
        setObstaclePosition((prev) => prev - OBSTACLE_SPEED);

        // --- Obstacle Reset & Coin Spawning ---
        if (obstaclePosition < -OBSTACLE_WIDTH) {
          // Obstacle has moved off-screen
          setObstaclePosition(GAME_WIDTH); // Reset to the right
          // Set a new random height for the top obstacle
          const newObstacleHeight =
            Math.floor(Math.random() * (GAME_HEIGHT - OBSTACLE_GAP - 50)) + 50;
          setObstacleHeight(newObstacleHeight);

          // --- Spawn Coin ---
          if (Math.random() < COIN_SPAWN_RATE) {
            // Calculate safe coin position within the gap
            const gapTop = newObstacleHeight + 20; // 20px buffer from top pipe
            const gapBottom = newObstacleHeight + OBSTACLE_GAP - 20; // 20px buffer from bottom pipe
            const safeGapHeight = gapBottom - gapTop;

            // Only spawn coin if there's enough safe space
            if (safeGapHeight >= COIN_SIZE) {
              const coinY =
                gapTop + Math.random() * (safeGapHeight - COIN_SIZE);
              setCoins((prevCoins) => [
                ...prevCoins,
                {
                  id: nextCoinId,
                  x: GAME_WIDTH + 50,
                  y: coinY,
                  collected: false,
                },
              ]);
              setNextCoinId((prev) => prev + 1);
            }
          }
        }

        // --- Move Coins ---
        setCoins((prevCoins) =>
          prevCoins
            .map((coin) => ({ ...coin, x: coin.x - OBSTACLE_SPEED }))
            .filter((coin) => coin.x > -COIN_SIZE && !coin.collected)
        );
      }, 30); // ~33 frames per second
    }
    return () => clearInterval(gameLoopInterval);
  }, [gameHasStarted, isGameOver, obstaclePosition, nextCoinId]);

  // --- Collision Detection ---
  useEffect(() => {
    const hasHitGround = birdPosition >= GAME_HEIGHT - BIRD_SIZE;

    // Bird's collision box (smaller than visual size for better gameplay)
    const COLLISION_MARGIN = 20; // Reduce collision box by 15px on each side
    const birdLeft = 100 + COLLISION_MARGIN;
    const birdRight = birdLeft + BIRD_SIZE - COLLISION_MARGIN * 2;
    const birdTop = birdPosition + COLLISION_MARGIN;
    const birdBottom = birdPosition + BIRD_SIZE - COLLISION_MARGIN;

    // Obstacle collision box
    const obstacleLeft = obstaclePosition;
    const obstacleRight = obstaclePosition + OBSTACLE_WIDTH;
    const topObstacleBottom = obstacleHeight;
    const bottomObstacleTop = obstacleHeight + OBSTACLE_GAP;

    // Check collision with top obstacle
    const hasHitTopObstacle =
      birdRight > obstacleLeft &&
      birdLeft < obstacleRight &&
      birdTop < topObstacleBottom;

    // Check collision with bottom obstacle
    const hasHitBottomObstacle =
      birdRight > obstacleLeft &&
      birdLeft < obstacleRight &&
      birdBottom > bottomObstacleTop;

    if (hasHitGround || hasHitTopObstacle || hasHitBottomObstacle) {
      setIsGameOver(true);
      setGameHasStarted(false);
    }
  }, [birdPosition, obstaclePosition, obstacleHeight]);

  // --- Save Score When Game Ends ---
  useEffect(() => {
    if (isGameOver && score > 0 && !scoreSavedThisSession) {
      console.log("🎮 Game ended, saving score...");
      setScoreSavedThisSession(true);
      saveScoreToLeaderboard();
    }
  }, [isGameOver, saveScoreToLeaderboard, score, scoreSavedThisSession]);

  // --- Coin Collision Detection ---
  useEffect(() => {
    // Use same collision margins as obstacles for consistency
    const COLLISION_MARGIN = 15;
    const birdLeft = 100 + COLLISION_MARGIN;
    const birdRight = birdLeft + BIRD_SIZE - COLLISION_MARGIN * 2;
    const birdTop = birdPosition + COLLISION_MARGIN;
    const birdBottom = birdPosition + BIRD_SIZE - COLLISION_MARGIN;

    setCoins((prevCoins) =>
      prevCoins.map((coin) => {
        if (coin.collected) return coin;

        const coinLeft = coin.x;
        const coinRight = coin.x + COIN_SIZE;
        const coinTop = coin.y;
        const coinBottom = coin.y + COIN_SIZE;

        // Check collision with bird
        const hasCollectedCoin =
          birdRight > coinLeft &&
          birdLeft < coinRight &&
          birdBottom > coinTop &&
          birdTop < coinBottom;

        if (hasCollectedCoin) {
          setCoinsCollected((prev) => prev + 1);
          return { ...coin, collected: true };
        }

        return coin;
      })
    );
  }, [birdPosition]);

  // --- Handle User Input ---
  const handleClick = useCallback(() => {
    // Don't allow game interaction until name is entered
    if (!hasEnteredName) {
      return;
    }

    if (!gameHasStarted && !isGameOver) {
      // Start the game
      setGameHasStarted(true);
    } else if (gameHasStarted && !isGameOver) {
      // Jump
      setBirdPosition((prev) => Math.max(0, prev - JUMP_HEIGHT));
      setBirdRotation(-30); // <-- Tilt up on jump
    }
    // No action if game is over, until reset
  }, [gameHasStarted, isGameOver, hasEnteredName]);

  // --- Handle Spacebar Input ---
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        // Prevent scrolling
        e.preventDefault();
        handleClick();
      }
    };
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [handleClick]);

  // --- Reset Game ---
  const resetGame = () => {
    setBirdPosition(GAME_HEIGHT / 2);
    setBirdRotation(0); // <-- Reset rotation
    setGameHasStarted(false);
    setIsGameOver(false);
    setScore(0);
    setGameStartTime(null); // Reset timer
    setObstaclePosition(GAME_WIDTH);
    setObstacleHeight(150);
    setCoins([]);
    setCoinsCollected(0);
    setNextCoinId(1);
    setScoreMessage(null); // Clear any score messages
    setScoreSavedThisSession(false); // Reset score saved flag
  };

  // --- Styles ---
  // Define styles for the button to handle hover
  const baseButtonStyles: React.CSSProperties = {
    padding: "12px 24px",
    backgroundColor: "rgba(255, 255, 255, 0.15)", // Glass background
    color: "#ffffff",
    fontSize: "1.5rem",
    fontWeight: "bold",
    borderRadius: "12px", // More rounded for glass effect
    boxShadow:
      "0 8px 32px rgba(255, 255, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.2)", // Glass shadow with inner light
    border: "1px solid rgba(255, 255, 255, 0.2)", // Glass border
    backdropFilter: "blur(12px) saturate(1.5)", // Glass blur effect
    cursor: "pointer",
    transition: "all 0.3s ease-in-out",
    textShadow: "0 1px 2px rgba(0, 0, 0, 0.3)", // Subtle text shadow
  };

  const hoverButtonStyles: React.CSSProperties = {
    ...baseButtonStyles,
    backgroundColor: "rgba(255, 255, 255, 0.25)", // Enhanced glass on hover
    transform: "translateY(-2px)",
    boxShadow:
      "0 12px 40px rgba(255, 255, 255, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.3)", // Enhanced glass glow
    border: "1px solid rgba(255, 255, 255, 0.3)", // Brighter glass border
    backdropFilter: "blur(15px) saturate(1.8)", // Enhanced blur
  };

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        // Starry night background for the entire page
        backgroundImage: `
          radial-gradient(2px 2px at 10% 20%, #ffffff, transparent),
          radial-gradient(1px 1px at 15% 40%, #ffffff, transparent),
          radial-gradient(2px 2px at 25% 10%, #ffffff, transparent),
          radial-gradient(1px 1px at 35% 60%, #ffffff, transparent),
          radial-gradient(1px 1px at 45% 25%, #ffffff, transparent),
          radial-gradient(2px 2px at 55% 70%, #ffffff, transparent),
          radial-gradient(1px 1px at 65% 15%, #ffffff, transparent),
          radial-gradient(1px 1px at 75% 45%, #ffffff, transparent),
          radial-gradient(2px 2px at 85% 80%, #ffffff, transparent),
          radial-gradient(1px 1px at 95% 35%, #ffffff, transparent),
          radial-gradient(1px 1px at 5% 75%, #ffffff, transparent),
          radial-gradient(2px 2px at 20% 85%, #ffffff, transparent),
          radial-gradient(1px 1px at 40% 90%, #ffffff, transparent),
          radial-gradient(1px 1px at 60% 5%, #ffffff, transparent),
          radial-gradient(2px 2px at 80% 50%, #ffffff, transparent),
          radial-gradient(1px 1px at 90% 95%, #ffffff, transparent),
          linear-gradient(to bottom, #0f172a, #1e293b 40%, #374151 80%, #4b5563)
        `,
        backgroundColor: "#0c1017", // Very dark night background fallback
        fontFamily: "sans-serif",
        position: "relative",
      }}
    >
      {/* Leaderboard - Fixed position on left (Desktop only) */}
      {!isMobile && (
        <div
          style={{
            position: "fixed",
            left: "20px",
            top: "50%",
            transform: "translateY(-50%)",
            width: "250px",
            height: `${GAME_HEIGHT}px`,
            // Translucent background with stars
            backgroundImage: `
              radial-gradient(1px 1px at 20px 30px, rgba(255, 255, 255, 0.8), transparent),
              radial-gradient(1px 1px at 60px 80px, rgba(255, 255, 255, 0.6), transparent),
              radial-gradient(1px 1px at 120px 40px, rgba(255, 255, 255, 0.7), transparent),
              radial-gradient(1px 1px at 180px 90px, rgba(255, 255, 255, 0.5), transparent),
              radial-gradient(1px 1px at 220px 20px, rgba(255, 255, 255, 0.8), transparent),
              radial-gradient(1px 1px at 40px 140px, rgba(255, 255, 255, 0.6), transparent),
              radial-gradient(1px 1px at 100px 180px, rgba(255, 255, 255, 0.7), transparent),
              radial-gradient(1px 1px at 160px 220px, rgba(255, 255, 255, 0.5), transparent),
              radial-gradient(1px 1px at 200px 160px, rgba(255, 255, 255, 0.8), transparent),
              linear-gradient(to bottom, rgba(31, 41, 55, 0.7), rgba(55, 65, 81, 0.8))
            `,
            backgroundColor: "rgba(31, 41, 55, 0.6)", // Translucent dark background
            borderRadius: "12px",
            backdropFilter: "blur(10px)",
            padding: "20px",
            color: "white",
            overflow: "auto",
            zIndex: 10,
            boxShadow:
              "0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.1)",
          }}
        >
          <h2
            style={{
              fontSize: "1.5rem",
              marginBottom: "20px",
              color: "#a78bfa", // Purple color instead of yellow
              textAlign: "center",
            }}
          >
            🏆 Leaderboard
          </h2>
          {isLoadingLeaderboard ? (
            <LoadingBird />
          ) : leaderboard.length === 0 ? (
            <p style={{ textAlign: "center", color: "#9ca3af" }}>
              No scores yet!
            </p>
          ) : (
            <div style={{ transition: "opacity 0.2s ease" }}>
              {leaderboard.map((entry, index) => {
                const isCurrentPlayer =
                  entry.name.trim().toLowerCase() ===
                  playerName.trim().toLowerCase();
                const isFirstPlace = index === 0;

                return (
                  <div
                    key={index}
                    style={{
                      backgroundColor: isFirstPlace
                        ? "rgba(255, 255, 255, 0.25)" // Prominent glass effect for first place
                        : isCurrentPlayer
                        ? "rgba(255, 255, 255, 0.15)" // Glass effect for current player
                        : "rgba(55, 65, 81, 0.6)",
                      color: "#fff",
                      padding: "12px",
                      borderRadius: "12px",
                      marginBottom: "8px",
                      border: isFirstPlace
                        ? "1px solid rgba(255, 255, 255, 0.3)" // Glass border
                        : isCurrentPlayer
                        ? "1px solid rgba(255, 255, 255, 0.2)" // Glass border for current player
                        : "1px solid rgba(75, 85, 99, 0.6)",
                      backdropFilter: isFirstPlace
                        ? "blur(15px) saturate(1.8)" // Enhanced glass effect
                        : isCurrentPlayer
                        ? "blur(12px) saturate(1.5)" // Glass effect for current player
                        : "blur(5px)",
                      boxShadow: isFirstPlace
                        ? "0 8px 32px rgba(255, 255, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.2)" // Glass shadow with inner light
                        : isCurrentPlayer
                        ? "0 4px 16px rgba(255, 255, 255, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.1)" // Glass shadow for current player
                        : "0 2px 8px rgba(0, 0, 0, 0.3)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          fontWeight: "bold",
                          color: isFirstPlace
                            ? "#ffffff"
                            : isCurrentPlayer
                            ? "rgba(255, 255, 255, 0.95)" // Slight transparency for glass effect
                            : "#ffffff",
                          textShadow:
                            isFirstPlace || isCurrentPlayer
                              ? "0 1px 2px rgba(0, 0, 0, 0.3)" // Subtle text shadow for glass effect
                              : undefined,
                        }}
                      >
                        #{index + 1} {entry.name}
                      </span>
                      <span style={{ fontSize: "0.9rem" }}>
                        {formatTime(entry.score)}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        marginTop: "4px",
                        opacity: 0.8,
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <img
                        src={process.env.PUBLIC_URL + "/dappies.svg"}
                        alt="Dappies"
                        style={{ width: "12px", height: "12px" }}
                      />
                      {entry.dappies} •{" "}
                      {entry.created_at
                        ? new Date(entry.created_at).toLocaleDateString()
                        : "Today"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Mobile Leaderboard Button */}
      {isMobile && (
        <button
          onClick={() => setShowLeaderboardModal(true)}
          style={{
            position: "fixed",
            top: "20px",
            right: "20px",
            backgroundColor: "rgba(167, 139, 250, 0.9)", // Purple with transparency
            color: "white",
            border: "none",
            borderRadius: "12px",
            padding: "10px 16px",
            fontSize: "0.9rem",
            fontWeight: "bold",
            cursor: "pointer",
            backdropFilter: "blur(10px)",
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.3)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          🏆 Leaderboard
        </button>
      )}

      {/* Centered Game Container */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          minHeight: "100vh",
        }}
      >
        {/* Game Container */}
        <div
          style={{
            width: `${GAME_WIDTH}px`,
            height: `${GAME_HEIGHT}px`,
            // Night time background with stars
            backgroundImage: `
            radial-gradient(2px 2px at 20px 30px, #ffffff, transparent),
            radial-gradient(2px 2px at 40px 70px, #ffffff, transparent),
            radial-gradient(1px 1px at 90px 40px, #ffffff, transparent),
            radial-gradient(1px 1px at 130px 80px, #ffffff, transparent),
            radial-gradient(2px 2px at 160px 30px, #ffffff, transparent),
            radial-gradient(1px 1px at 200px 60px, #ffffff, transparent),
            radial-gradient(2px 2px at 240px 20px, #ffffff, transparent),
            radial-gradient(1px 1px at 280px 90px, #ffffff, transparent),
            radial-gradient(1px 1px at 320px 40px, #ffffff, transparent),
            radial-gradient(2px 2px at 360px 70px, #ffffff, transparent),
            radial-gradient(1px 1px at 400px 30px, #ffffff, transparent),
            radial-gradient(1px 1px at 440px 80px, #ffffff, transparent),
            radial-gradient(1px 1px at 480px 50px, #ffffff, transparent),
            radial-gradient(2px 2px at 60px 120px, #ffffff, transparent),
            radial-gradient(1px 1px at 100px 150px, #ffffff, transparent),
            radial-gradient(1px 1px at 140px 180px, #ffffff, transparent),
            radial-gradient(2px 2px at 180px 140px, #ffffff, transparent),
            radial-gradient(1px 1px at 220px 160px, #ffffff, transparent),
            radial-gradient(1px 1px at 260px 200px, #ffffff, transparent),
            radial-gradient(2px 2px at 300px 170px, #ffffff, transparent),
            radial-gradient(1px 1px at 340px 190px, #ffffff, transparent),
            radial-gradient(1px 1px at 380px 220px, #ffffff, transparent),
            radial-gradient(1px 1px at 420px 180px, #ffffff, transparent),
            radial-gradient(2px 2px at 460px 210px, #ffffff, transparent),
            linear-gradient(to bottom, #0f172a, #1e293b 40%, #374151 80%, #4b5563)
          `,
            backgroundColor: "#0f172a", // Very dark blue-gray fallback
            borderRadius: "8px", // rounded-lg
            boxShadow:
              "0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.2)", // Darker shadow for night
            overflow: "hidden",
            position: "relative",
          }}
          onClick={handleClick} // Allow click/tap to control
        >
          {/* --- Render Game Elements --- */}
          <Bird top={birdPosition} rotation={birdRotation} />{" "}
          {/* <-- Pass rotation */}
          <Obstacle x={obstaclePosition} height={obstacleHeight} isTop={true} />
          <Obstacle
            x={obstaclePosition}
            height={GAME_HEIGHT - obstacleHeight - OBSTACLE_GAP}
            isTop={false}
          />
          {/* --- Render Coins --- */}
          {coins.map((coin) => (
            <CoinComponent
              key={coin.id}
              x={coin.x}
              y={coin.y}
              collected={coin.collected}
            />
          ))}
          {/* --- UI Overlays --- */}
          <div
            style={{
              position: "absolute",
              top: "16px", // top-4
              left: "50%", // left-1/2
              transform: "translateX(-50%)", // -translate-x-1/2
              color: "white", // text-white
              fontSize: "3rem", // text-5xl
              fontWeight: "bold",
              textShadow: "2px 2px 0 rgba(0, 0, 0, 0.5)",
              textAlign: "center",
            }}
          >
            {formatTime(score)}
          </div>
          {/* --- Dappies Counter --- */}
          <div
            style={{
              position: "absolute",
              top: "16px", // top-4
              right: "16px", // right-4
              color: "#ffd700", // Gold color
              fontSize: "1.5rem", // text-2xl
              fontWeight: "bold",
              textShadow: "2px 2px 0 rgba(0, 0, 0, 0.5)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <img
              src={process.env.PUBLIC_URL + "/dappies.svg"}
              alt="Dappies"
              style={{ width: "24px", height: "24px" }}
            />
            {coinsCollected}
          </div>
          {/* Name Input Modal */}
          {showNameInput && !hasEnteredName && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                // Starry night background overlay
                backgroundImage: `
                  radial-gradient(1px 1px at 80px 120px, rgba(255, 255, 255, 0.8), transparent),
                  radial-gradient(1px 1px at 180px 200px, rgba(255, 255, 255, 0.6), transparent),
                  radial-gradient(1px 1px at 320px 100px, rgba(255, 255, 255, 0.7), transparent),
                  radial-gradient(1px 1px at 420px 180px, rgba(255, 255, 255, 0.5), transparent),
                  radial-gradient(1px 1px at 150px 300px, rgba(255, 255, 255, 0.8), transparent),
                  radial-gradient(1px 1px at 280px 250px, rgba(255, 255, 255, 0.6), transparent),
                  radial-gradient(1px 1px at 380px 80px, rgba(255, 255, 255, 0.7), transparent),
                  linear-gradient(to bottom, rgba(0, 0, 0, 0.8), rgba(15, 23, 42, 0.9))
                `,
                backgroundColor: "rgba(0, 0, 0, 0.8)",
                zIndex: 1000,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  // Enhanced glass effect background
                  background: `
                    radial-gradient(circle at 20% 80%, rgba(255, 255, 255, 0.15) 0%, transparent 50%),
                    radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.15) 0%, transparent 50%),
                    radial-gradient(circle at 40% 40%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
                    linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)
                  `,
                  padding: "40px",
                  borderRadius: "20px",
                  backdropFilter: "blur(20px) saturate(1.8)",
                  boxShadow: `
                    0 20px 40px rgba(0, 0, 0, 0.4),
                    0 0 0 1px rgba(255, 255, 255, 0.1),
                    inset 0 1px 0 rgba(255, 255, 255, 0.2),
                    inset 0 -1px 0 rgba(255, 255, 255, 0.1)
                  `,
                  textAlign: "center",
                  color: "white",
                  position: "relative",
                  overflow: "hidden",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2
                  style={{
                    fontSize: "2rem",
                    marginBottom: "20px",
                    color: "#a78bfa", // Purple color
                  }}
                >
                  Enter Your Name
                </h2>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => {
                    // Sanitize input in real-time
                    const sanitized = e.target.value
                      .replace(/[<>]/g, "") // Remove XSS characters
                      .replace(/[^\w\s-]/g, "") // Only allow alphanumeric, spaces, and hyphens
                      .slice(0, 20); // Limit length
                    setPlayerName(sanitized);
                  }}
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      handleNameSubmit();
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Your name..."
                  style={{
                    padding: "16px 20px",
                    fontSize: "1.2rem",
                    borderRadius: "12px",
                    border: "1px solid rgba(255, 255, 255, 0.2)", // Glass border
                    backgroundColor: "rgba(255, 255, 255, 0.1)", // Glass background
                    backdropFilter: "blur(12px) saturate(1.5)",
                    color: "white",
                    marginBottom: "24px",
                    width: "280px",
                    textAlign: "center",
                    boxShadow: `
                      0 4px 16px rgba(0, 0, 0, 0.2),
                      inset 0 1px 0 rgba(255, 255, 255, 0.2),
                      inset 0 -1px 0 rgba(255, 255, 255, 0.1)
                    `,
                    outline: "none",
                    transition: "all 0.3s ease",
                  }}
                  autoFocus
                />
                <br />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNameSubmit();
                  }}
                  disabled={playerName.trim() === ""}
                  style={{
                    ...baseButtonStyles,
                    backgroundColor:
                      playerName.trim() === ""
                        ? "rgba(107, 114, 128, 0.3)" // Disabled glass effect
                        : "rgba(255, 255, 255, 0.2)", // Enhanced glass for enabled state
                    backdropFilter:
                      playerName.trim() === ""
                        ? "blur(8px)" // Reduced blur for disabled
                        : "blur(15px) saturate(1.8)", // Enhanced glass for enabled
                    border:
                      playerName.trim() === ""
                        ? "1px solid rgba(107, 114, 128, 0.3)" // Disabled border
                        : "1px solid rgba(255, 255, 255, 0.3)", // Glass border
                    cursor:
                      playerName.trim() === "" ? "not-allowed" : "pointer",
                    opacity: playerName.trim() === "" ? 0.6 : 1, // Visual disabled state
                  }}
                >
                  Start Game
                </button>
              </div>
            </div>
          )}
          {!gameHasStarted && !isGameOver && hasEnteredName && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0, // inset-0
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                // Subtle starry overlay for start screen
                backgroundImage: `
                  radial-gradient(1px 1px at 150px 100px, rgba(255, 255, 255, 0.4), transparent),
                  radial-gradient(1px 1px at 300px 200px, rgba(255, 255, 255, 0.3), transparent),
                  radial-gradient(1px 1px at 400px 120px, rgba(255, 255, 255, 0.5), transparent),
                  radial-gradient(1px 1px at 250px 300px, rgba(255, 255, 255, 0.3), transparent),
                  radial-gradient(1px 1px at 80px 250px, rgba(255, 255, 255, 0.4), transparent)
                `,
              }}
            >
              <div
                style={{
                  color: "white",
                  fontSize: "1.875rem", // text-3xl
                  fontWeight: "bold",
                  textShadow: "2px 2px 0 rgba(0, 0, 0, 0.5)",
                  textAlign: "center",
                  padding: "16px", // p-4
                }}
              >
                Get Ready!
                <br />
                <span style={{ fontSize: "1.25rem" }}>
                  (Click or Press Space)
                </span>
              </div>
            </div>
          )}
          {isGameOver && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0, // inset-0
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                // Starry night background overlay for game over
                backgroundImage: `
                  radial-gradient(1px 1px at 100px 80px, rgba(255, 255, 255, 0.8), transparent),
                  radial-gradient(1px 1px at 200px 150px, rgba(255, 255, 255, 0.6), transparent),
                  radial-gradient(1px 1px at 350px 100px, rgba(255, 255, 255, 0.7), transparent),
                  radial-gradient(1px 1px at 450px 200px, rgba(255, 255, 255, 0.5), transparent),
                  radial-gradient(1px 1px at 150px 250px, rgba(255, 255, 255, 0.8), transparent),
                  radial-gradient(1px 1px at 300px 300px, rgba(255, 255, 255, 0.6), transparent),
                  radial-gradient(1px 1px at 400px 50px, rgba(255, 255, 255, 0.7), transparent),
                  linear-gradient(to bottom, rgba(0, 0, 0, 0.5), rgba(15, 23, 42, 0.7))
                `,
                backgroundColor: "rgba(0, 0, 0, 0.5)", // bg-black/50
                backdropFilter: "blur(4px)", // backdrop-blur-sm
              }}
            >
              <div
                style={{
                  color: "white",
                  fontSize: "3rem", // text-5xl
                  fontWeight: "bold",
                  textShadow: "2px 2px 0 rgba(0, 0, 0, 0.5)",
                  marginBottom: "16px", // mb-4
                }}
              >
                Game Over
              </div>
              <div
                style={{
                  color: "white",
                  fontSize: "1.875rem", // text-3xl
                  fontWeight: "bold",
                  textShadow: "2px 2px 0 rgba(0, 0, 0, 0.5)",
                  marginBottom: "16px", // mb-4
                }}
              >
                Time: {formatTime(score)}
              </div>
              <div
                style={{
                  color: "#ffd700", // Gold color
                  fontSize: "1.5rem", // text-2xl
                  fontWeight: "bold",
                  textShadow: "2px 2px 0 rgba(0, 0, 0, 0.5)",
                  marginBottom: "32px", // mb-8
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                }}
              >
                <img
                  src={process.env.PUBLIC_URL + "/dappies.svg"}
                  alt="Dappies"
                  style={{ width: "24px", height: "24px" }}
                />
                {coinsCollected}
              </div>
              {scoreMessage && (
                <div
                  style={{
                    color: "#10b981", // text-green-400
                    fontSize: "1.25rem", // text-xl
                    fontWeight: "bold",
                    textShadow: "2px 2px 0 rgba(0, 0, 0, 0.5)",
                    marginBottom: "16px", // mb-4
                    textAlign: "center",
                    padding: "8px 16px",
                    backgroundColor: "rgba(16, 185, 129, 0.1)",
                    borderRadius: "8px",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                  }}
                >
                  {scoreMessage}
                </div>
              )}
              <button
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                  e.stopPropagation(); // Prevent click from triggering game jump
                  resetGame();
                }}
                style={isHovering ? hoverButtonStyles : baseButtonStyles}
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
              >
                Restart
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Leaderboard Modal */}
      {isMobile && showLeaderboardModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
          onClick={() => setShowLeaderboardModal(false)}
        >
          <div
            style={{
              width: "90%",
              maxWidth: "400px",
              maxHeight: "70vh",
              // Translucent background with stars
              backgroundImage: `
                radial-gradient(1px 1px at 20px 30px, rgba(255, 255, 255, 0.8), transparent),
                radial-gradient(1px 1px at 60px 80px, rgba(255, 255, 255, 0.6), transparent),
                radial-gradient(1px 1px at 120px 40px, rgba(255, 255, 255, 0.7), transparent),
                radial-gradient(1px 1px at 180px 90px, rgba(255, 255, 255, 0.5), transparent),
                radial-gradient(1px 1px at 220px 20px, rgba(255, 255, 255, 0.8), transparent),
                linear-gradient(to bottom, rgba(31, 41, 55, 0.9), rgba(55, 65, 81, 0.9))
              `,
              backgroundColor: "rgba(31, 41, 55, 0.9)",
              borderRadius: "16px",
              backdropFilter: "blur(15px)",
              padding: "24px",
              color: "white",
              overflow: "auto",
              boxShadow: "0 16px 64px rgba(0, 0, 0, 0.6)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "20px",
              }}
            >
              <h2
                style={{
                  fontSize: "1.5rem",
                  color: "#a78bfa",
                  margin: 0,
                }}
              >
                🏆 Leaderboard
              </h2>
              <button
                onClick={() => setShowLeaderboardModal(false)}
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.1)",
                  color: "white",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  borderRadius: "8px",
                  padding: "8px 12px",
                  fontSize: "0.9rem",
                  cursor: "pointer",
                  backdropFilter: "blur(10px)",
                }}
              >
                ✕ Close
              </button>
            </div>

            {isLoadingLeaderboard ? (
              <LoadingBird />
            ) : leaderboard.length === 0 ? (
              <p style={{ textAlign: "center", color: "#9ca3af" }}>
                No scores yet!
              </p>
            ) : (
              <div style={{ transition: "opacity 0.2s ease" }}>
                {leaderboard.map((entry, index) => {
                  const isCurrentPlayer =
                    entry.name.trim().toLowerCase() ===
                    playerName.trim().toLowerCase();
                  const isFirstPlace = index === 0;

                  return (
                    <div
                      key={index}
                      style={{
                        backgroundColor: isFirstPlace
                          ? "rgba(255, 255, 255, 0.25)"
                          : isCurrentPlayer
                          ? "rgba(255, 255, 255, 0.15)"
                          : "rgba(55, 65, 81, 0.6)",
                        color: "#fff",
                        padding: "12px",
                        borderRadius: "12px",
                        marginBottom: "8px",
                        border: isFirstPlace
                          ? "1px solid rgba(255, 255, 255, 0.3)"
                          : isCurrentPlayer
                          ? "1px solid rgba(255, 255, 255, 0.2)"
                          : "1px solid rgba(75, 85, 99, 0.6)",
                        backdropFilter: isFirstPlace
                          ? "blur(15px) saturate(1.8)"
                          : isCurrentPlayer
                          ? "blur(12px) saturate(1.5)"
                          : "blur(5px)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span
                          style={{
                            fontWeight: "bold",
                            color: isFirstPlace
                              ? "#ffffff"
                              : isCurrentPlayer
                              ? "rgba(255, 255, 255, 0.95)"
                              : "#ffffff",
                          }}
                        >
                          #{index + 1} {entry.name}
                        </span>
                        <span style={{ fontSize: "0.9rem" }}>
                          {formatTime(entry.score)}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: "0.8rem",
                          marginTop: "4px",
                          opacity: 0.8,
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <img
                          src={process.env.PUBLIC_URL + "/dappies.svg"}
                          alt="Dappies"
                          style={{ width: "12px", height: "12px" }}
                        />
                        {entry.dappies} •{" "}
                        {entry.created_at
                          ? new Date(entry.created_at).toLocaleDateString()
                          : "Today"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
