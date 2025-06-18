"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// 커스텀 훅: 디바운싱
const useDebounce = <T extends unknown[]>(callback: (...args: T) => void, delay: number) => {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  return useCallback(
    (...args: T) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay]
  );
};

// 커스텀 훅: 테트리스 게임 로직
interface Tetromino {
  shape: number[][];
  color: string;
  x: number;
  y: number;
}

interface Tetrominos {
  [key: string]: { shape: number[][]; color: string };
}

interface TetrisGameState {
  board: (number | string)[][];
  currentPiece: Tetromino | null;
  nextPiece: Tetromino | null;
  score: number;
  lines: number;
  level: number;
  gameOver: boolean;
  isPaused: boolean;
  gameStarted: boolean;
  clearingRows: number[];
  animationColumn: number;
  isClearing: boolean;
  dropOffsetY: number;
}

interface TetrisGameActions {
  initGame: () => void;
  movePiece: (direction: 'left' | 'right' | 'down') => void;
  rotatePiece: () => void;
  hardDrop: () => void;
  togglePause: () => void;
}

const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;
const NEXT_BLOCK_SIZE = 12;
const TETROMINO_KEYS = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

const TETROMINOS: Tetrominos = {
  I: { shape: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], color: 'tetris-cyan' },
  O: { shape: [[1, 1], [1, 1]], color: 'tetris-yellow' },
  T: { shape: [[0, 1, 0], [1, 1, 1], [0, 0, 0]], color: 'tetris-purple' },
  S: { shape: [[0, 1, 1], [1, 1, 0], [0, 0, 0]], color: 'tetris-green' },
  Z: { shape: [[1, 1, 0], [0, 1, 1], [0, 0, 0]], color: 'tetris-red' },
  J: { shape: [[1, 0, 0], [1, 1, 1], [0, 0, 0]], color: 'tetris-blue' },
  L: { shape: [[0, 0, 1], [1, 1, 1], [0, 0, 0]], color: 'tetris-orange' }
};

const useTetrisGame = (): [TetrisGameState, TetrisGameActions] => {
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
  const [clearingRows, setClearingRows] = useState<number[]>([]);
  const [animationColumn, setAnimationColumn] = useState<number>(-1);
  const [isClearing, setIsClearing] = useState<boolean>(false);
  const [dropOffsetY, setDropOffsetY] = useState<number>(0);

  const gameLoopRef = useRef<NodeJS.Timeout | null>(null);
  const dropTimeRef = useRef<number>(1000);
  const animationRef = useRef<number | null>(null);
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const moveSoundRef = useRef<HTMLAudioElement | null>(null);
  const rotateSoundRef = useRef<HTMLAudioElement | null>(null);
  const lineClearSoundRef = useRef<HTMLAudioElement | null>(null);
  const hardDropSoundRef = useRef<HTMLAudioElement | null>(null);
  const collapseSoundRef = useRef<HTMLAudioElement | null>(null);

  const playSound = useCallback((audioRef: React.MutableRefObject<HTMLAudioElement | null>) => {
    if (audioRef.current) {
      try {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(e => console.error("Sound playback error:", e));
      } catch (e) {
        console.error("Error playing sound:", e);
      }
    }
  }, []);

  const playBGM = useCallback(() => {
    if (bgmRef.current && !isPaused && gameStarted) {
      try {
        bgmRef.current.play().catch(e => console.error("BGM playback error:", e));
      } catch (e) {
        console.error("Error playing BGM:", e);
      }
    }
  }, [isPaused, gameStarted]);

  const stopBGM = useCallback(() => {
    if (bgmRef.current) {
      try {
        bgmRef.current.pause();
      } catch (e) {
        console.error("Error stopping BGM:", e);
      }
    }
  }, []);

  const resetBGM = useCallback(() => {
    if (bgmRef.current) {
      try {
        bgmRef.current.pause();
        bgmRef.current.currentTime = 0;
      } catch (e) {
        console.error("Error resetting BGM:", e);
      }
    }
  }, []);

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

  const placePiece = useCallback((piece: Tetromino, boardState: (number | string)[][]) => {
    const newBoard = boardState.map(row => [...row]);
    for (let y = 0; y < piece.shape.length; y++) {
      for (let x = 0; x < piece.shape[y].length; x++) {
        if (piece.shape[y][x]) {
          const boardY = piece.y + y;
          const boardX = piece.x + x;
          if (boardY >= 0 && boardY < BOARD_HEIGHT && boardX >= 0 && boardX < BOARD_WIDTH) {
            newBoard[boardY][boardX] = piece.color;
          }
        }
      }
    }
    return newBoard;
  }, []);

  const getClearedLines = useCallback((boardState: (number | string)[][]): number[] => {
    const clearedLineYs: number[] = [];
    for (let y = 0; y < BOARD_HEIGHT; y++) {
      if (boardState[y].every(cell => cell !== 0)) {
        clearedLineYs.push(y);
      }
    }
    return clearedLineYs;
  }, []);

  const removeAndShiftLines = useCallback((boardState: (number | string)[][], linesToRemove: number[]) => {
    const newBoard = boardState.filter((_, y) => !linesToRemove.includes(y));
    const newEmptyRows = Array(linesToRemove.length).fill(0).map(() => Array(BOARD_WIDTH).fill(0));
    return [...newEmptyRows, ...newBoard];
  }, []);

  const initGame = useCallback(() => {
    const newBoard = Array(BOARD_HEIGHT).fill(0).map(() => Array(BOARD_WIDTH).fill(0));
    setBoard(newBoard);
    const initialPiece = createRandomTetromino();

    if (checkCollision(initialPiece, newBoard, 0, 0)) {
      setGameOver(true);
      setGameStarted(false);
      resetBGM();
      return;
    }

    setCurrentPiece(initialPiece);
    setNextPiece(createRandomTetromino());
    setScore(0);
    setLines(0);
    setLevel(1);
    setGameOver(false);
    setGameStarted(true);
    setIsPaused(false);
    setDropOffsetY(0);
    setClearingRows([]);
    setAnimationColumn(-1);
    setIsClearing(false);
    dropTimeRef.current = 1000;
    playBGM();
  }, [createRandomTetromino, checkCollision, playBGM, resetBGM]);

  const rotatePieceLogic = useCallback((piece: Tetromino | null): Tetromino | null => {
    if (!piece) return null;
    const rotated = piece.shape[0].map((_, index) =>
      piece.shape.map(row => row[index]).reverse()
    );
    return { ...piece, shape: rotated };
  }, []);

  const movePiece = useCallback((direction: 'left' | 'right' | 'down') => {
    if (!currentPiece || gameOver || isPaused || isClearing) return;

    let dx = 0, dy = 0;
    switch (direction) {
      case 'left':
        dx = -1;
        playSound(moveSoundRef);
        break;
      case 'right':
        dx = 1;
        playSound(moveSoundRef);
        break;
      case 'down':
        dy = 1;
        break;
    }

    if (!checkCollision(currentPiece, board, dx, dy)) {
      setCurrentPiece(prev => ({
        ...(prev as Tetromino),
        x: (prev as Tetromino).x + dx,
        y: (prev as Tetromino).y + dy
      }));
    } else if (direction === 'down') {
      playSound(collapseSoundRef);
      const newBoard = placePiece(currentPiece, board);
      const clearedLineYs = getClearedLines(newBoard);

      if (clearedLineYs.length > 0) {
        setClearingRows(clearedLineYs);
        setAnimationColumn(-1);
        setIsClearing(true);
      } else {
        setBoard(newBoard);
        if (checkCollision(currentPiece, board, 0, 0)) {
          setGameOver(true);
          setGameStarted(false);
          resetBGM();
          return;
        }
        setCurrentPiece(nextPiece);
        setNextPiece(createRandomTetromino());
      }
    }
  }, [currentPiece, board, gameOver, isPaused, isClearing, checkCollision, placePiece, getClearedLines, nextPiece, createRandomTetromino, playSound, resetBGM]);

  const rotatePiece = useCallback(() => {
    if (!currentPiece || gameOver || isPaused || isClearing) return;
    const rotatedPiece = rotatePieceLogic(currentPiece);
    if (rotatedPiece && !checkCollision(rotatedPiece, board)) {
      setCurrentPiece(rotatedPiece);
      playSound(rotateSoundRef);
    }
  }, [currentPiece, gameOver, isPaused, isClearing, rotatePieceLogic, checkCollision, board, playSound]);

  const hardDrop = useCallback(() => {
    if (!currentPiece || gameOver || isPaused || isClearing) return;

    playSound(hardDropSoundRef);

    let dropDistance = 0;
    while (!checkCollision(currentPiece, board, 0, dropDistance + 1)) {
      dropDistance++;
    }
    const finalY = currentPiece.y + dropDistance;
    const totalScore = dropDistance * 2;

    const startY = currentPiece.y;
    const duration = 300;
    const startTime = performance.now();

    const animateDrop = (currentTime: number) => {
      if (!currentPiece) return;

      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const interpolatedY = startY + (finalY - startY) * progress;

      setDropOffsetY(interpolatedY - startY);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animateDrop);
      } else {
        setDropOffsetY(0);
        const droppedPiece = { ...currentPiece, y: finalY };
        setCurrentPiece(droppedPiece);
        const newBoard = placePiece(droppedPiece, board);
        const clearedLineYs = getClearedLines(newBoard);

        if (clearedLineYs.length > 0) {
          setClearingRows(clearedLineYs);
          setAnimationColumn(-1);
          setIsClearing(true);
        } else {
          setBoard(newBoard);
          if (checkCollision(droppedPiece, board, 0, 0)) {
            setGameOver(true);
            setGameStarted(false);
            resetBGM();
            return;
          }
          setCurrentPiece(nextPiece);
          setNextPiece(createRandomTetromino());
          setScore(prev => prev + totalScore);
        }
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
          animationRef.current = null;
        }
      }
    };

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    animationRef.current = requestAnimationFrame(animateDrop);
  }, [currentPiece, board, gameOver, isPaused, isClearing, checkCollision, placePiece, getClearedLines, nextPiece, createRandomTetromino, playSound, hardDropSoundRef, resetBGM]);

  const gameLoop = useCallback(() => {
    if (!isClearing) {
      movePiece('down');
    }
  }, [movePiece, isClearing]);

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
  }, [gameStarted, gameOver, isPaused, gameLoop]);

  useEffect(() => {
    if (!isClearing || animationColumn >= BOARD_WIDTH) {
      if (isClearing) {
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
          dropTimeRef.current = Math.max(100, 1000 - (newLevel - 1) * 100); // 최소 100ms
          return newLines;
        });

        setClearingRows([]);
        setAnimationColumn(-1);
        setIsClearing(false);
        if (!gameOver && !isPaused) {
          setCurrentPiece(nextPiece);
          setNextPiece(createRandomTetromino());
        }
      }
      return;
    }

    const animateClear = () => {
      setAnimationColumn(prev => {
        const nextColumn = prev + 1;
        if (nextColumn >= BOARD_WIDTH) {
          return BOARD_WIDTH;
        }
        return nextColumn;
      });

      if (animationColumn < BOARD_WIDTH - 1) {
        animationRef.current = requestAnimationFrame(animateClear);
      }
    };

    if (isClearing && animationColumn < BOARD_WIDTH) {
      animationRef.current = requestAnimationFrame(animateClear);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isClearing, animationColumn, board, clearingRows, removeAndShiftLines, playSound, lineClearSoundRef, level, gameOver, isPaused, nextPiece, createRandomTetromino]);

  useEffect(() => {
    try {
      bgmRef.current = new Audio('/sound/tetris_BGM.mp3');
      bgmRef.current.loop = true;
      bgmRef.current.volume = 0.5;
      moveSoundRef.current = new Audio('/sound/move.mp3');
      rotateSoundRef.current = new Audio('/sound/rotate.mp3');
      lineClearSoundRef.current = new Audio('/sound/lineClear.mp3');
      hardDropSoundRef.current = new Audio('/sound/hardDrop.mp3');
      collapseSoundRef.current = new Audio('/sound/collapse.mp3');
    } catch (e) {
      console.error("Error initializing audio:", e);
    }

    return () => {
      try {
        bgmRef.current?.pause();
        bgmRef.current = null;
        moveSoundRef.current = null;
        rotateSoundRef.current = null;
        lineClearSoundRef.current = null;
        hardDropSoundRef.current = null;
        collapseSoundRef.current = null;
      } catch (e) {
        console.error("Error cleaning up audio:", e);
      }
    };
  }, []);

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

  const togglePause = useCallback(() => {
    setIsPaused(prev => !prev);
  }, []);

  return [
    {
      board,
      currentPiece,
      nextPiece,
      score,
      lines,
      level,
      gameOver,
      isPaused,
      gameStarted,
      clearingRows,
      animationColumn,
      isClearing,
      dropOffsetY
    },
    {
      initGame,
      movePiece,
      rotatePiece,
      hardDrop,
      togglePause
    }
  ];
};

const TetrisGame = () => {
  const [gameState, gameActions] = useTetrisGame();
  const { board, currentPiece, nextPiece, score, lines, level, gameOver, isPaused, gameStarted, clearingRows, animationColumn, isClearing, dropOffsetY } = gameState;
  const { initGame, movePiece, rotatePiece, hardDrop, togglePause } = gameActions;

  const [blockSize, setBlockSize] = useState<number>(25);
  const gameContentRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const infoPanelRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const getViewportHeight = useCallback(() => {
    return window.visualViewport ? window.visualViewport.height : window.innerHeight;
  }, []);

  const calculateLayout = useCallback(() => {
    if (!titleRef.current || !infoPanelRef.current || !controlsRef.current) return;

    const vw = window.innerWidth;
    const vh = getViewportHeight();

    const titleHeight = titleRef.current.offsetHeight || 0;
    const infoPanelHeight = infoPanelRef.current.offsetHeight || 0;
    const controlsHeight = controlsRef.current.offsetHeight || 0;

    const verticalBuffer = 80;
    const availableHeightForBoard = vh - titleHeight - infoPanelHeight - controlsHeight - verticalBuffer;
    const availableWidthForBoard = vw;

    const effectiveAvailableHeight = Math.max(0, availableHeightForBoard);
    const effectiveAvailableWidth = Math.max(0, availableWidthForBoard);

    const widthBasedSize = Math.floor(effectiveAvailableWidth / BOARD_WIDTH);
    const heightBasedSize = Math.floor(effectiveAvailableHeight / BOARD_HEIGHT);
    let calculatedSize = Math.min(widthBasedSize, heightBasedSize);

    calculatedSize = Math.min(calculatedSize, 30);
    const newBlockSize = Math.max(20, calculatedSize);
    setBlockSize(newBlockSize);
  }, [getViewportHeight]);

  const debouncedCalculateLayout = useDebounce(calculateLayout, 100);

  useEffect(() => {
    calculateLayout();
    window.addEventListener('resize', debouncedCalculateLayout);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', debouncedCalculateLayout);
    }
    return () => {
      window.removeEventListener('resize', debouncedCalculateLayout);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', debouncedCalculateLayout);
      }
    };
  }, [debouncedCalculateLayout, calculateLayout]);

  const renderBoard = useCallback(() => {
    const displayBoard: (number | string)[][] = board.map(row => [...row]);

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

    if (isClearing && clearingRows.length > 0) {
      for (const rowY of clearingRows) {
        for (let colX = 0; colX <= animationColumn && colX < BOARD_WIDTH; colX++) {
          displayBoard[rowY][colX] = 0;
        }
      }
    }

    return displayBoard;
  }, [board, currentPiece, gameOver, isPaused, isClearing, clearingRows, animationColumn]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now()
    };
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current || !gameStarted || gameOver || isPaused || isClearing) return;

      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const touchStart = touchStartRef.current;
      const deltaX = touchEndX - touchStart.x;
      const deltaY = touchEndY - touchStart.y;
      const deltaTime = Date.now() - touchStart.time;

      if (deltaTime < 300) {
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
          if (deltaX > 0) movePiece('right');
          else movePiece('left');
        } else if (Math.abs(deltaY) > 50 && deltaY > 0) {
          hardDrop();
        } else if (Math.abs(deltaX) < 30 && Math.abs(deltaY) < 30) {
          rotatePiece();
        }
      }

      touchStartRef.current = null;
    },
    [movePiece, hardDrop, rotatePiece, gameStarted, gameOver, isPaused, isClearing]
  );

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!gameStarted || gameOver || isClearing) return;

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
          rotatePiece();
          break;
        case ' ':
          e.preventDefault();
          hardDrop();
          break;
        case 'p':
        case 'P':
          e.preventDefault();
          togglePause();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [gameStarted, gameOver, isClearing, movePiece, rotatePiece, hardDrop, togglePause]);

  const displayBoard = renderBoard();

  return (
    <div
      className="flex flex-col bg-gray-900 text-white font-mono overflow-hidden h-screen"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
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
          animation: flashBorder 0.5s linear infinite;
        }

        .drop-animate {
          transform: translateY(${dropOffsetY * blockSize}px);
          transition: transform 0.3s linear;
        }
      `}</style>

      <h1 ref={titleRef} className="text-5xl font-bold text-center text-green-400 drop-shadow-lg">
        TETRIS
      </h1>

      <div className="flex flex-col flex-grow items-center justify-center mt-[-40px]">
        <div ref={infoPanelRef} className="flex justify-center items-center gap-6 mb-2 mt-0">
          {gameStarted && (
            <div className="flex justify-center items-center gap-6 mt-0">
              <div className="flex flex-col items-center">
                <div className="text-xl">Score:</div>
                <div className="font-bold text-yellow-400 text-3xl">{score}</div>
              </div>
              <div className="flex flex-col items-center">
                <div className="text-xl">Lines:</div>
                <div className="font-bold text-cyan-400 text-3xl">{lines}</div>
              </div>
              <div className="flex flex-col items-center">
                <div className="text-xl">Level:</div>
                <div className="font-bold text-purple-400 text-3xl">{level}</div>
              </div>
            </div>
          )}

          {nextPiece && !gameOver && (
            <div className="mt-2 text-center">
              <h3 className="text-lg mb-1 text-gray-300">Next</h3>
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

        <div ref={gameContentRef} className="flex justify-center items-center">
          <div
            className="relative bg-gray-800 border-2 border-gray-700 rounded-sm shadow-lg flex-shrink-0 mx-auto"
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
                    ${currentPiece && y >= currentPiece.y && x >= currentPiece.x && currentPiece.shape[y - currentPiece.y]?.[x - currentPiece.x] ? 'drop-animate' : ''}
                  `}
                  style={{
                    width: `${blockSize}px`,
                    height: `${blockSize}px`,
                    boxSizing: 'border-box',
                    border: '0.5px solid rgba(255, 255, 255, 0.05)',
                  }}
                />
              ))
            ))}

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
                        onClick={togglePause}
                        className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-full text-lg shadow-lg transform transition duration-300 hover:scale-105"
                      >
                        Resume Game
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

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
        </div>
      </div>

      <div ref={controlsRef} className="bg-gradient-to-br from-gray-800 to-gray-950 py-2 px-2 mt-auto flex justify-around items-center w-full max-w-sm mx-auto rounded-xl shadow-2xl">
        <div className="flex gap-2 ml-[-0.5rem]">
          <button
            onTouchStart={(e) => {
              e.preventDefault();
              movePiece('left');
            }}
            onTouchEnd={(e) => e.preventDefault()}
            className="bg-gray-700 active:bg-gray-600 px-6 py-4 rounded-md flex items-center justify-center text-white text-lg shadow-md transform transition duration-150 ease-in-out hover:scale-105 active:scale-95"
          >
            <ChevronLeft size={24} />
          </button>
          <button
            onTouchStart={(e) => {
              e.preventDefault();
              movePiece('right');
            }}
            onTouchEnd={(e) => e.preventDefault()}
            className="bg-gray-700 active:bg-gray-600 px-6 py-4 rounded-md flex items-center justify-center text-white text-lg shadow-md transform transition duration-150 ease-in-out hover:scale-105 active:scale-95"
          >
            <ChevronRight size={24} />
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onTouchStart={(e) => {
              e.preventDefault();
              rotatePiece();
            }}
            onTouchEnd={(e) => e.preventDefault()}
            className="bg-gradient-to-br from-blue-600 to-blue-800 active:from-blue-800 active:to-blue-950 px-6 py-4 rounded-md font-bold text-lg shadow-md transform transition duration-150 ease-in-out hover:scale-105 active:scale-95"
          >
            ROT
          </button>
          <button
            onTouchStart={(e) => {
              e.preventDefault();
              hardDrop();
            }}
            onTouchEnd={(e) => e.preventDefault()}
            className="bg-gradient-to-br from-red-600 to-red-800 active:from-red-800 active:to-red-950 px-6 py-4 rounded-md font-bold text-lg shadow-md transform transition duration-150 ease-in-out hover:scale-105 active:scale-95"
          >
            DROP
          </button>
        </div>
      </div>
    </div>
  );
};

export default TetrisGame;