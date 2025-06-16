"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Tetromino {
  shape: number[][];
  color: string;
  x: number;
  y: number;
}

interface Tetrominos {
  [key: string]: { shape: number[][]; color: string; };
}

// 테트리스 블록 모양 정의
const TETROMINOS: Tetrominos = {
  I: {
    shape: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ],
    color: 'tetris-cyan'
  },
  O: {
    shape: [
      [1, 1],
      [1, 1]
    ],
    color: 'tetris-yellow'
  },
  T: {
    shape: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0]
    ],
    color: 'tetris-purple'
  },
  S: {
    shape: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0]
    ],
    color: 'tetris-green'
  },
  Z: {
    shape: [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0]
    ],
    color: 'tetris-red'
  },
  J: {
    shape: [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0]
    ],
    color: 'tetris-blue'
  },
  L: {
    shape: [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0]
    ],
    color: 'tetris-orange'
  }
};

const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;
const NEXT_BLOCK_SIZE = 20; // 미리보기 블록을 위한 고정 크기
const TETROMINO_KEYS = Object.keys(TETROMINOS);

const TetrisGame = () => {
  const [board, setBoard] = useState<(number | string)[][]>(() => 
    Array(BOARD_HEIGHT).fill(0).map(() => Array(BOARD_WIDTH).fill(0))
  );
  const [currentPiece, setCurrentPiece] = useState<Tetromino | null>(null);
  const [nextPiece, setNextPiece] = useState<Tetromino | null>(null);
  const [score, setScore] = useState<number>(0);
  const [lines, setLines] = useState<number>(0);
  const [level, setLevel] = useState<number>(1);
  const [gameOver, setGameOver] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [gameStarted, setGameStarted] = useState<boolean>(false);
  const [blockSize, setBlockSize] = useState<number>(25);
  const [clearingRows, setClearingRows] = useState<number[]>([]);
  const [animationColumn, setAnimationColumn] = useState<number>(-1);
  const [isClearing, setIsClearing] = useState<boolean>(false);

  const gameLoopRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const dropTimeRef = useRef<number>(1000);
  const gameContentRef = useRef<HTMLDivElement | null>(null);

  // Sound refs
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const moveSoundRef = useRef<HTMLAudioElement | null>(null);
  const rotateSoundRef = useRef<HTMLAudioElement | null>(null);
  const lineClearSoundRef = useRef<HTMLAudioElement | null>(null);
  const hardDropSoundRef = useRef<HTMLAudioElement | null>(null);
  const collapseSoundRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    bgmRef.current = new Audio('/sound/tetris_BGM.mp3');
    bgmRef.current.loop = true;
    bgmRef.current.volume = 0.5; // Adjust volume as needed

    moveSoundRef.current = new Audio('/sound/move.mp3');
    rotateSoundRef.current = new Audio('/sound/rotate.mp3');
    lineClearSoundRef.current = new Audio('/sound/lineClear.mp3');
    hardDropSoundRef.current = new Audio('/sound/hardDrop.mp3');
    collapseSoundRef.current = new Audio('/sound/collapse.mp3');

    return () => {
      bgmRef.current?.pause();
      bgmRef.current = null;
      moveSoundRef.current = null;
      rotateSoundRef.current = null;
      lineClearSoundRef.current = null;
      hardDropSoundRef.current = null;
      collapseSoundRef.current = null;
    };
  }, []);

  // Sound play functions
  const playSound = useCallback((audioRef: React.MutableRefObject<HTMLAudioElement | null>) => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(e => console.error("Error playing sound:", e));
    }
  }, []);

  const playBGM = useCallback(() => {
    if (bgmRef.current && !isPaused && gameStarted) {
      bgmRef.current.play().catch(e => console.error("Error playing BGM:", e));
    }
  }, [isPaused, gameStarted]);

  const stopBGM = useCallback(() => {
    bgmRef.current?.pause();
  }, []);

  const resetBGM = useCallback(() => {
    if (bgmRef.current) {
      bgmRef.current.pause();
      bgmRef.current.currentTime = 0; // Rewind for next play
    }
  }, []);

  // 뷰포트 높이 계산 (더 정확한 방법)
  const getViewportHeight = useCallback(() => {
    // CSS의 100vh 대신 실제 뷰포트 높이 사용
    return window.visualViewport ? window.visualViewport.height : window.innerHeight;
  }, []);

  useEffect(() => {
    const calculateLayout = () => {
      console.log("calculateLayout 함수 호출됨!");
      const vw = window.innerWidth;
      const vh = getViewportHeight();

      // Get actual dimensions of the game content area
      const gameContentWidth = gameContentRef.current ? gameContentRef.current.offsetWidth : vw; // Fallback to viewport width
      const gameContentHeight = gameContentRef.current ? gameContentRef.current.offsetHeight : vh; // Fallback to viewport height

      // UI 요소들의 예상 높이 (이제 board size 계산에는 직접 사용되지 않음)
      const infoPanelWidth = 120; // max-w-[120px]
      const gapBetweenBoardAndInfo = 16; // gap-4
      
      // 사용 가능한 공간 계산 (게임 보드 자체를 위한 공간)
      const availableWidthForBoard = gameContentWidth - infoPanelWidth - gapBetweenBoardAndInfo;
      const availableHeightForBoard = gameContentHeight; // Board takes full height of its container
      
      // 블록 크기 계산
      const widthBasedSize = Math.floor(availableWidthForBoard / BOARD_WIDTH);
      const heightBasedSize = Math.floor(availableHeightForBoard / BOARD_HEIGHT);
      const calculatedSize = Math.min(widthBasedSize, heightBasedSize);
      
      // 최소/최대 크기 제한
      const newBlockSize = Math.max(15, Math.min(calculatedSize, 80)); // Increased max size to 80
      setBlockSize(newBlockSize);

      // Debugging: Log calculated values
      console.log("Viewport Width:", vw, "Viewport Height:", vh);
      console.log("Game Content Ref Width:", gameContentWidth, "Game Content Ref Height:", gameContentHeight);
      console.log("Available Width (for board only):", availableWidthForBoard, "Available Height (for board only):", availableHeightForBoard);
      console.log("Calculated Size (min of width/height based):", calculatedSize);
      console.log("New Block Size (after max/min constraints):", newBlockSize);
    };

    calculateLayout();
    
    const handleResize = () => {
      setTimeout(calculateLayout, 100);
    };

    window.addEventListener('resize', handleResize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
      }
    };
  }, [getViewportHeight]);

  // 랜덤 테트로미노 생성
  const createRandomTetromino = useCallback((): Tetromino => {
    const randomKey = TETROMINO_KEYS[Math.floor(Math.random() * TETROMINO_KEYS.length)];
    const { shape, color } = TETROMINOS[randomKey];
    return {
      shape,
      color,
      x: Math.floor(BOARD_WIDTH / 2) - Math.floor(shape[0].length / 2),
      y: 0
    };
  }, []);

  // 충돌 검사
  const checkCollision = useCallback((piece: Tetromino | null, boardState: (number | string)[][], dx = 0, dy = 0) => {
    if (!piece) return false;
    
    for (let y = 0; y < piece.shape.length; y++) {
      for (let x = 0; x < piece.shape[y].length; x++) {
        if (piece.shape[y][x]) {
          const newX = piece.x + x + dx;
          const newY = piece.y + y + dy;
          
          if (newX < 0 || newX >= BOARD_WIDTH || newY >= BOARD_HEIGHT) {
            return true;
          }
          
          if (newY >= 0 && boardState[newY] && boardState[newY][newX]) {
            return true;
          }
        }
      }
    }
    return false;
  }, []);

  // 게임 초기화
  const initGame = useCallback(() => {
    const newBoard = Array(BOARD_HEIGHT).fill(0).map(() => Array(BOARD_WIDTH).fill(0));
    setBoard(newBoard);
    const initialPiece = createRandomTetromino();

    if (checkCollision(initialPiece, newBoard, 0, 1)) {
      setGameOver(true);
      setGameStarted(false);
      resetBGM(); // Use resetBGM on immediate game over
      return;
    }

    setCurrentPiece(initialPiece);
    setNextPiece(createRandomTetromino());
    setScore(0);
    setLines(0);
    setLevel(1);
    setGameOver(false);
    setGameStarted(true);
    dropTimeRef.current = 1000;
    playBGM(); // Start BGM on game start
  }, [createRandomTetromino, checkCollision, playBGM, resetBGM]);

  // 블록 회전
  const rotatePiece = useCallback((piece: Tetromino | null): Tetromino | null => {
    if (!piece) return null;
    const rotated = piece.shape[0].map((_, index) =>
      piece.shape.map(row => row[index]).reverse()
    );
    return { ...piece, shape: rotated };
  }, []);

  // 라인 삭제 검사 (이제 지워질 라인들을 반환만 함)
  const getClearedLines = useCallback((boardState: (number | string)[][]): number[] => {
    const clearedLineYs: number[] = [];
    for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
      if (boardState[y].every(cell => cell !== 0)) {
        clearedLineYs.push(y);
      }
    }
    return clearedLineYs;
  }, []);

  // 실제로 라인을 제거하고 보드를 아래로 내림
  const removeAndShiftLines = useCallback((boardState: (number | string)[][], linesToRemove: number[]) => {
    const newBoard = boardState.filter((_, y) => !linesToRemove.includes(y));
    const newEmptyRows = Array(linesToRemove.length).fill(0).map(() => Array(BOARD_WIDTH).fill(0));
    return [...newEmptyRows, ...newBoard];
  }, []);

  // 블록을 보드에 고정
  const placePiece = useCallback((piece: Tetromino, boardState: (number | string)[][]) => {
    const newBoard = boardState.map(row => [...row]);
    
    for (let y = 0; y < piece.shape.length; y++) {
      for (let x = 0; x < piece.shape[y].length; x++) {
        if (piece.shape[y][x]) {
          const boardY = piece.y + y;
          const boardX = piece.x + x;
          if (boardY >= 0) {
            newBoard[boardY][boardX] = piece.color;
          }
        }
      }
    }
    
    return newBoard;
  }, []);

  // 블록 이동
  const movePiece = useCallback((direction: 'left' | 'right' | 'down') => {
    if (!currentPiece || gameOver || isPaused) return;
    
    let dx = 0, dy = 0;
    
    switch (direction) {
      case 'left': dx = -1; playSound(moveSoundRef); break; // Play move sound
      case 'right': dx = 1; playSound(moveSoundRef); break; // Play move sound
      case 'down': dy = 1; break;
    }
    
    if (!checkCollision(currentPiece, board, dx, dy)) {
      setCurrentPiece(prev => ({
        ...(prev as Tetromino),
        x: (prev as Tetromino).x + dx,
        y: (prev as Tetromino).y + dy
      }));
    } else if (direction === 'down') {
      playSound(collapseSoundRef); // Play collapse sound when piece lands
      const newBoard = placePiece(currentPiece, board);
      const clearedLineYs = getClearedLines(newBoard);
      
      if (clearedLineYs.length > 0) {
        // Start line clear animation
        setClearingRows(clearedLineYs);
        setAnimationColumn(-1); // Reset animation column
        setIsClearing(true); // Indicate that clearing animation is in progress
        // Game logic for score/lines/level will be handled after animation
      } else {
        // No lines to clear, proceed as usual
        setBoard(newBoard);
        if (currentPiece.y <= 1) {
          setGameOver(true);
          setGameStarted(false);
          resetBGM();
          return;
        }
        setCurrentPiece(nextPiece);
        setNextPiece(createRandomTetromino());
      }
    }
  }, [currentPiece, board, gameOver, isPaused, checkCollision, placePiece, getClearedLines, nextPiece, createRandomTetromino, playSound, resetBGM, setClearingRows, setAnimationColumn, setIsClearing]);

  // 하드 드롭
  const hardDrop = useCallback(() => {
    if (!currentPiece || gameOver || isPaused) return;

    playSound(hardDropSoundRef);

    let dropDistance = 0;
    while (!checkCollision(currentPiece, board, 0, dropDistance + 1)) {
        dropDistance++;
    }

    const finalY = currentPiece.y + dropDistance;

    // Animation variables
    let currentAnimatedPiece: Tetromino = { ...currentPiece };
    let scoreAccumulated = 0;

    const animateStep = () => {
        if (currentAnimatedPiece.y < finalY) {
            currentAnimatedPiece = { ...currentAnimatedPiece, y: currentAnimatedPiece.y + 1 };
            setCurrentPiece(currentAnimatedPiece); // Update state to trigger re-render
            scoreAccumulated += 2; // Score per row dropped
            setTimeout(animateStep, 20); // Small delay for animation speed
        } else {
            // Animation complete, finalize placement
            const newBoard = placePiece(currentAnimatedPiece, board);
            const clearedLineYs = getClearedLines(newBoard);

            if (clearedLineYs.length > 0) {
                // Start line clear animation
                setClearingRows(clearedLineYs);
                setAnimationColumn(-1); // Reset animation column
                setIsClearing(true); // Indicate that clearing animation is in progress
                // Game logic for score/lines/level will be handled after animation
            } else {
                // No lines to clear, proceed as usual
                setBoard(newBoard);

                if (currentAnimatedPiece.y <= 1) { // Check final position for game over
                    setGameOver(true);
                    setGameStarted(false);
                    resetBGM();
                    return;
                }
                setCurrentPiece(nextPiece);
                setNextPiece(createRandomTetromino());
                setScore(prev => prev + scoreAccumulated); // Add accumulated score
            }
        }
    };

    animateStep(); // Start the animation
  }, [currentPiece, board, gameOver, isPaused, checkCollision, placePiece, getClearedLines, nextPiece, createRandomTetromino, playSound, resetBGM, setClearingRows, setAnimationColumn, setIsClearing]);

  // 게임 루프
  const gameLoop = useCallback(() => {
    movePiece('down');
  }, [movePiece]);

  // 게임 루프 시작 및 정지
  useEffect(() => {
    if (gameStarted && !gameOver && !isPaused) {
      gameLoopRef.current = setInterval(gameLoop, dropTimeRef.current);
    } else {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current);
      }
    }
    return () => {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current);
      }
    };
  }, [gameStarted, gameOver, isPaused, gameLoop, dropTimeRef]);

  // Line clear animation effect
  useEffect(() => {
    if (isClearing && animationColumn < BOARD_WIDTH) {
      const timer = setTimeout(() => {
        setAnimationColumn(prev => prev + 1);
      }, 15); // Speed of the clear animation (reduced to 15ms)
      return () => clearTimeout(timer);
    } else if (isClearing && animationColumn === BOARD_WIDTH) {
      // Animation complete, now clear lines from board and update score/etc.
      const newBoardAfterClear = removeAndShiftLines(board, clearingRows);
      setBoard(newBoardAfterClear);
      playSound(lineClearSoundRef);

      const clearedCount = clearingRows.length;
      const points = [0, 40, 100, 300, 1200][clearedCount] * level;
      setScore(prev => prev + points);
      setLines(prev => {
        const newLines = prev + clearedCount;
        const newLevel = Math.floor(newLines / 10) + 1;
        setLevel(newLevel);
        dropTimeRef.current = Math.max(50, 1000 - (newLevel - 1) * 100);
        return newLines;
      });

      setClearingRows([]);
      setAnimationColumn(-1);
      setIsClearing(false);
      // After clearing, immediately generate next piece if game is still active
      if (!gameOver && !isPaused) {
        setCurrentPiece(nextPiece);
        setNextPiece(createRandomTetromino());
      }
    }
  }, [isClearing, animationColumn, board, clearingRows, removeAndShiftLines, playSound, lineClearSoundRef, level, setScore, setLines, setLevel, dropTimeRef, gameOver, isPaused, setCurrentPiece, nextPiece, createRandomTetromino]);

  // BGM playback control
  useEffect(() => {
    if (bgmRef.current) {
      if (gameStarted && !gameOver && !isPaused) {
        playBGM();
      } else if (isPaused) {
        stopBGM();
      } else if (gameOver) {
        resetBGM();
      }
    }
  }, [gameStarted, gameOver, isPaused, playBGM, stopBGM, resetBGM]);

  // 키보드 이벤트
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!gameStarted || gameOver) return;
      
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          movePiece('left');
          break;
        case 'ArrowRight':
          e.preventDefault();
          movePiece('right');
          break;
        case 'ArrowDown':
          e.preventDefault();
          movePiece('down');
          break;
        case 'ArrowUp':
          e.preventDefault();
          const rotatedPiece = rotatePiece(currentPiece);
          if (rotatedPiece && !checkCollision(rotatedPiece, board)) {
            setCurrentPiece(rotatedPiece);
            playSound(rotateSoundRef); // Play rotate sound
          }
          break;
        case ' ':
          e.preventDefault();
          hardDrop();
          break;
        case 'p':
        case 'P':
          e.preventDefault();
          setIsPaused(prev => !prev);
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [gameStarted, gameOver, movePiece, rotatePiece, hardDrop, currentPiece, board, checkCollision, playSound]);

  // 보드 렌더링
  const renderBoard = useCallback(() => {
    const displayBoard: (number | string)[][] = board.map(row => [...row]);
    
    // 현재 피스 표시
    if (currentPiece && !gameOver && !isPaused && !isClearing) {
      for (let y = 0; y < currentPiece.shape.length; y++) {
        for (let x = 0; x < currentPiece.shape[y].length; x++) {
          if (currentPiece.shape[y][x]) {
            const boardY = currentPiece.y + y;
            const boardX = currentPiece.x + x;
            if (boardY >= 0 && boardY < BOARD_HEIGHT && boardX >= 0 && boardX < BOARD_WIDTH) {
              displayBoard[boardY][boardX] = currentPiece.color;
            }
          }
        }
      }
    }

    // 라인 클리어 애니메이션 중인 블록 처리
    if (isClearing && clearingRows.length > 0) {
      for (const rowY of clearingRows) {
        for (let colX = 0; colX < BOARD_WIDTH; colX++) {
          if (colX <= animationColumn) {
            displayBoard[rowY][colX] = 0; // Clear the block visually
          }
        }
      }
    }
    
    return displayBoard;
  }, [board, currentPiece, gameOver, isPaused, isClearing, clearingRows, animationColumn]);

  const displayBoard = renderBoard();

  return (
    <div
      className={`flex flex-col bg-gray-900 text-white font-mono overflow-hidden h-screen`}
    >
      <style jsx>{`
        .tetris-cyan {
          background: linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.0) 100%),
                      linear-gradient(135deg, #67e8f9 0%, #22d3ee 50%, #0891b2 100%);
          border-top: 1px solid #a5f3fc;
          border-left: 1px solid #a5f3fc;
          border-right: 1px solid #0891b2;
          border-bottom: 1px solid #0891b2;
        }
        .tetris-yellow {
          background: linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.0) 100%),
                      linear-gradient(135deg, #fef08a 0%, #facc15 50%, #ca8a04 100%);
          border-top: 1px solid #fef3c7;
          border-left: 1px solid #fef3c7;
          border-right: 1px solid #ca8a04;
          border-bottom: 1px solid #ca8a04;
        }
        .tetris-purple {
          background: linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.0) 100%),
                      linear-gradient(135deg, #c084fc 0%, #a855f7 50%, #7c3aed 100%);
          border-top: 1px solid #ddd6fe;
          border-left: 1px solid #ddd6fe;
          border-right: 1px solid #7c3aed;
          border-bottom: 1px solid #7c3aed;
        }
        .tetris-green {
          background: linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.0) 100%),
                      linear-gradient(135deg, #86efac 0%, #22c55e 50%, #15803d 100%);
          border-top: 1px solid #bbf7d0;
          border-left: 1px solid #bbf7d0;
          border-right: 1px solid #15803d;
          border-bottom: 1px solid #15803d;
        }
        .tetris-red {
          background: linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.0) 100%),
                      linear-gradient(135deg, #fca5a5 0%, #ef4444 50%, #dc2626 100%);
          border-top: 1px solid #fecaca;
          border-left: 1px solid #fecaca;
          border-right: 1px solid #dc2626;
          border-bottom: 1px solid #dc2626;
        }
        .tetris-blue {
          background: linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.0) 100%),
                      linear-gradient(135deg, #93c5fd 0%, #3b82f6 50%, #1d4ed8 100%);
          border-top: 1px solid #bfdbfe;
          border-left: 1px solid #bfdbfe;
          border-right: 1px solid #1d4ed8;
          border-bottom: 1px solid #1d4ed8;
        }
        .tetris-orange {
          background: linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.0) 100%),
                      linear-gradient(135deg, #fdba74 0%, #f97316 50%, #ea580c 100%);
          border-top: 1px solid #fed7aa;
          border-left: 1px solid #fed7aa;
          border-right: 1px solid #ea580c;
          border-bottom: 1px solid #ea580c;
        }
        .tetris-gray {
          background: linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.0) 100%),
                      linear-gradient(135deg, #d1d5db 0%, #9ca3af 50%, #6b7280 100%);
          border-top: 1px solid #e5e7eb;
          border-left: 1px solid #e5e7eb;
          border-right: 1px solid #6b7280;
          border-bottom: 1px solid #6b7280;
        }

        @keyframes flashBorder {
          0% { border-color: transparent; }
          50% { border: 3px solid white; }
          100% { border-color: transparent; }
        }

        .flash-border {
          animation: flashBorder 0.1s linear infinite; /* 짧고 반복적인 깜빡임 */
        }
      `}</style>

      {/* 제목 */}
      <h1 className="text-2xl font-bold text-center text-green-400 drop-shadow-lg">
        Tetris Game
      </h1>

      {/* 게임 보드 및 정보 패널 (세로 모드에서도 가로 배치) */}
      <div ref={gameContentRef} className={`flex flex-grow justify-center items-center gap-4 flex-row`}>
        {/* 게임 보드 */}
        <div
          className={`relative bg-gray-800 border-2 border-gray-700 rounded-sm shadow-lg flex-shrink-0 mx-auto`}
          style={{
            width: `${BOARD_WIDTH * blockSize}px`,
            height: `${BOARD_HEIGHT * blockSize}px`,
            display: 'grid',
            gridTemplateColumns: `repeat(${BOARD_WIDTH}, ${blockSize}px)`,
            gridTemplateRows: `repeat(${BOARD_HEIGHT}, ${blockSize}px)`,
            boxShadow: '0 0 15px rgba(0,255,0,0.5), 0 0 30px rgba(0,255,0,0.3), 0 0 45px rgba(0,255,0,0.1)'
          }}
        >
          {displayBoard.map((row, y) => (
            row.map((cell, x) => (
              <div
                key={`${y}-${x}`}
                className={`
                  ${cell === 0 ? 'bg-gray-800' : cell}
                  ${isClearing && clearingRows.includes(y) ? 'flash-border' : ''}
                `}
                style={{
                  width: `${blockSize}px`,
                  height: `${blockSize}px`,
                  boxSizing: 'border-box',
                  border: '0.5px solid rgba(255, 255, 255, 0.05)', // Subtle grid lines
                }}
              />
            ))
          ))}

          {/* 게임 오버 / 일시정지 오버레이 */}
          {(gameOver || isPaused) && (
            <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-10">
              <div className="text-center">
                {gameOver && (
                  <>
                    <h2 className="text-5xl font-bold text-red-500 mb-4 animate-bounce">GAME OVER</h2>
                    <p className="text-xl text-gray-300 mb-6">Score: {score}</p>
                    <button
                      onClick={initGame}
                      className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-full text-lg shadow-lg transform transition duration-300 hover:scale-105"
                    >
                      Play Again
                    </button>
                  </>
                )}
                {isPaused && !gameOver && (
                  <>
                    <h2 className="text-5xl font-bold text-yellow-400 mb-4 animate-pulse">PAUSED</h2>
                    <p className="text-xl text-gray-300 mb-6">Press &apos;P&apos; to Resume</p>
                    <button
                      onClick={() => setIsPaused(false)}
                      className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-full text-lg shadow-lg transform transition duration-300 hover:scale-105"
                    >
                      Resume Game
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* 게임 시작 버튼 오버레이 */}
          {!gameStarted && !gameOver && (
            <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-10">
              <button
                onClick={initGame}
                className="bg-green-500 hover:bg-green-600 text-white font-bold py-4 px-8 rounded-full text-2xl shadow-lg transform transition duration-300 hover:scale-105"
              >
                Start Game
              </button>
            </div>
          )}
        </div>

        {/* 게임 정보 및 다음 블록 패널 (항상 우측에 배치) */}
        <div className={`flex flex-col justify-center items-start gap-2 max-w-[120px] h-full`}>
          <div className="text-sm text-left">Score: <span className="font-bold text-yellow-400">{score}</span></div>
          <div className="text-sm text-left">Lines: <span className="font-bold text-cyan-400">{lines}</span></div>
          <div className="text-sm text-left">Level: <span className="font-bold text-purple-400">{level}</span></div>

          {nextPiece && (
            <div className={`mt-2 text-center`}>
              <h3 className="text-sm mb-1 text-gray-300">Next</h3>
              <div
                className="bg-gray-800 border-2 border-gray-700 rounded-sm shadow-inner"
                style={{
                  width: `${NEXT_BLOCK_SIZE * 4}px`,
                  height: `${NEXT_BLOCK_SIZE * 4}px`,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  margin: 'auto',
                  padding: '0px',
                  boxSizing: 'border-box'
                }}
              >
                {/* 이 내부 div가 테트로미노의 실제 그리드가 됩니다 */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${nextPiece.shape[0].length}, ${NEXT_BLOCK_SIZE}px)`,
                    gridTemplateRows: `repeat(${nextPiece.shape.length}, ${NEXT_BLOCK_SIZE}px)`,
                  }}
                >
                  {nextPiece.shape.map((row, y) => (
                    row.map((cell, x) => (
                      <div
                        key={`${y}-${x}`}
                        className={`
                          ${cell ? nextPiece.color : 'bg-gray-800'}
                          ${cell ? 'border border-gray-700' : ''}
                        `}
                        style={{
                          width: `${NEXT_BLOCK_SIZE}px`,
                          height: `${NEXT_BLOCK_SIZE}px`,
                          boxSizing: 'border-box'
                        }}
                      />
                    ))
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 조작 버튼 (메인화면 하단) */}
      <div className="bg-gradient-to-br from-gray-800 to-gray-950 py-2 px-2 mt-auto flex justify-around items-center w-full max-w-sm mx-auto rounded-xl shadow-2xl">
        <div className="flex gap-2 ml-[-0.5rem]">
          <button
            onTouchStart={(e) => {
              e.preventDefault();
              movePiece('left');
            }}
            className="bg-gray-700 active:bg-gray-600 px-6 py-4 rounded-md flex items-center justify-center text-white text-lg shadow-md transform transition duration-150 ease-in-out hover:scale-105 active:scale-95"
          >
            <ChevronLeft size={24} />
          </button>
          <button
            onTouchStart={(e) => {
              e.preventDefault();
              movePiece('right');
            }}
            className="bg-gray-700 active:bg-gray-600 px-6 py-4 rounded-md flex items-center justify-center text-white text-lg shadow-md transform transition duration-150 ease-in-out hover:scale-105 active:scale-95 ml-[-0.25rem]"
          >
            <ChevronRight size={24} />
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onTouchStart={(e) => {
              e.preventDefault();
              const rotatedPiece = rotatePiece(currentPiece);
              if (rotatedPiece && !checkCollision(rotatedPiece, board)) {
                setCurrentPiece(rotatedPiece);
                playSound(rotateSoundRef);
              }
            }}
            className="bg-gradient-to-br from-blue-600 to-blue-800 active:from-blue-800 active:to-blue-950 px-6 py-4 rounded-md font-bold text-lg shadow-md transform transition duration-150 ease-in-out hover:scale-105 active:scale-95 ml-2"
          >
            ROT
          </button>
          <button
            onTouchStart={(e) => {
              e.preventDefault();
              hardDrop();
            }}
            className="bg-gradient-to-br from-red-600 to-red-800 active:from-red-800 active:to-red-950 px-4 py-4 rounded-md font-bold text-lg shadow-md transform transition duration-150 ease-in-out hover:scale-105 active:scale-95"
          >
            DROP
          </button>
        </div>
      </div>
    </div>
  );
};

export default TetrisGame;