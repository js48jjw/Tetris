"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Howl } from 'howler';
import { motion } from 'framer-motion';

interface Tetromino {
  shape: number[][];
  color: string;
  x: number;
  y: number;
}

interface Tetrominos {
  [key: string]: { shape: number[][]; color: string; };
}

// 사운드 파일 로드
const moveSound = new Howl({ src: ['/sound/move.mp3'] });
const rotateSound = new Howl({ src: ['/sound/rotate.mp3'] });
const hardDropSound = new Howl({ src: ['/sound/hardDrop.mp3'] });
const lineClearSound = new Howl({ src: ['/sound/lineClear.mp3'] });
const collapseSound = new Howl({ src: ['/sound/collapse.mp3'] });
const bgm = new Howl({ src: ['/sound/tetris_BGM.mp3'], loop: true, volume: 0.5 });

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
const TETROMINO_KEYS = Object.keys(TETROMINOS);

const CLEAR_ANIMATION_DURATION = 0.1;
const CLEAR_ANIMATION_CELL_DELAY_FACTOR = 0.03;
const MAX_CLEAR_ANIMATION_DELAY = BOARD_WIDTH * CLEAR_ANIMATION_CELL_DELAY_FACTOR;

const COLOR_MAP = {
  'tetris-cyan': 'rgba(67, 232, 249, 1)',
  'tetris-yellow': 'rgba(254, 240, 138, 1)',
  'tetris-purple': 'rgba(192, 132, 252, 1)',
  'tetris-green': 'rgba(134, 239, 172, 1)',
  'tetris-red': 'rgba(252, 165, 165, 1)',
  'tetris-blue': 'rgba(147, 197, 253, 1)',
  'tetris-orange': 'rgba(253, 186, 116, 1)',
};

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
  const [animatedPieceY, setAnimatedPieceY] = useState<number | null>(null);
  const [clearingLines, setClearingLines] = useState<number[]>([]);
  const [blockSize, setBlockSize] = useState<number>(30);
  const [isLandscape, setIsLandscape] = useState<boolean>(window.innerWidth > window.innerHeight);

  const gameLoopRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const dropTimeRef = useRef<number>(1000);

  useEffect(() => {
    const calculateBlockSize = () => {
      // 안드로이드 환경을 고려한 안전 영역 패딩 (상태바, 네비게이션 바 등)
      const safeAreaInsetTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat') || '0');
      const safeAreaInsetBottom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sab') || '0');
      
      // UI 요소 크기 (Tailwind 클래스 기반, rem 단위 고려)
      const titleHeight = 5 * 16 + 2 * 16; // text-5xl (5rem) + mb-8 (2rem)
      const headerHeight = 2 * 16 + 0.5 * 16; // p-2 (0.5rem) + text-xl (1.5rem, 추정)
      const mobileControlsHeight = isLandscape ? 0 : (4 * 16 + 3 * 16); // p-4 (4rem) + 버튼 크기 (약 3rem)
      
      // 수평 공간 계산
      const sidebarWidth = 8 * 16; // w-32 (32rem * 0.25 = 8rem)
      const horizontalPadding = 2 * (4 * 16); // p-4 양쪽
      const spaceX = 2 * 16; // space-x-8
      const availableWidth = window.innerWidth - horizontalPadding - (isLandscape ? sidebarWidth + spaceX : 0);
      
      // 수직 공간 계산
      const availableHeight = window.innerHeight - safeAreaInsetTop - safeAreaInsetBottom - titleHeight - headerHeight - mobileControlsHeight;
      
      // blockSize 계산
      const widthBasedSize = Math.floor(availableWidth / BOARD_WIDTH);
      const heightBasedSize = Math.floor(availableHeight / BOARD_HEIGHT);
      const newBlockSize = Math.max(20, Math.min(widthBasedSize, heightBasedSize, 40)); // 20px ~ 40px 제한

      setBlockSize(newBlockSize);
      setIsLandscape(window.innerWidth > window.innerHeight);
    };

    calculateBlockSize();
    window.addEventListener('resize', calculateBlockSize);
    window.addEventListener('orientationchange', calculateBlockSize);

    return () => {
      window.removeEventListener('resize', calculateBlockSize);
      window.removeEventListener('orientationchange', calculateBlockSize);
    };
  }, []);

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
      bgm.stop();
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
  }, [createRandomTetromino, checkCollision]);

  // 블록 회전
  const rotatePiece = useCallback((piece: Tetromino | null): Tetromino | null => {
    if (!piece) return null;
    const rotated = piece.shape[0].map((_, index) =>
      piece.shape.map(row => row[index]).reverse()
    );
    return { ...piece, shape: rotated };
  }, []);

  // 라인 삭제 검사
  const clearLines = useCallback((boardState: (number | string)[][]): (number | string)[][] => {
    const linesToClear: number[] = [];
    const newBoard = boardState.map(row => [...row]);
    
    for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
      if (newBoard[y].every(cell => cell !== 0)) {
        linesToClear.push(y);
      }
    }
    
    if (linesToClear.length > 0) {
      lineClearSound.play();
      setClearingLines(linesToClear);
      return boardState;
    }
    
    return boardState;
  }, []);

  // 라인 클리어 애니메이션 완료 후 처리
  const handleLineClearComplete = useCallback((clearedLinesCount: number, clearedLineYs: number[], originalBoard: (number | string)[][]) => {
    const newBoard = originalBoard.filter((_, y) => !clearedLineYs.includes(y));
    for (let i = 0; i < clearedLinesCount; i++) {
      newBoard.unshift(Array(BOARD_WIDTH).fill(0));
    }
    setBoard(newBoard);

    const points = [0, 40, 100, 300, 1200][clearedLinesCount] * level;
    setScore(prev => prev + points);
    setLines(prev => {
      const newLines = prev + clearedLinesCount;
      const newLevel = Math.floor(newLines / 10) + 1;
      setLevel(newLevel);
      dropTimeRef.current = Math.max(50, 1000 - (newLevel - 1) * 100);
      return newLines;
    });
    setClearingLines([]);
  }, [level]);

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
      case 'left': dx = -1; break;
      case 'right': dx = 1; break;
      case 'down': dy = 1; break;
    }
    
    if (!checkCollision(currentPiece, board, dx, dy)) {
      setCurrentPiece(prev => ({
        ...(prev as Tetromino),
        x: (prev as Tetromino).x + dx,
        y: (prev as Tetromino).y + dy
      }));
      if (direction === 'left' || direction === 'right') {
        moveSound.play();
      }
    } else if (direction === 'down') {
      collapseSound.play();
      const newBoard = placePiece(currentPiece, board);
      const linesToClear = newBoard.filter(row => row.every(cell => cell !== 0)).length;
      const finalBoard = clearLines(newBoard);

      if (linesToClear === 0) {
        setBoard(finalBoard);
        if (currentPiece.y <= 1) {
          setGameOver(true);
          setGameStarted(false);
          bgm.stop();
          return;
        }
        setCurrentPiece(nextPiece);
        setNextPiece(createRandomTetromino());
      }
    }
  }, [currentPiece, board, gameOver, isPaused, checkCollision, placePiece, clearLines, nextPiece, createRandomTetromino]);

  // 하드 드롭
  const hardDrop = useCallback(() => {
    if (!currentPiece || gameOver || isPaused) return;
    
    let dropDistance = 0;
    while (!checkCollision(currentPiece, board, 0, dropDistance + 1)) {
      dropDistance++;
    }
    
    const targetY = currentPiece.y + dropDistance;
    setAnimatedPieceY(targetY);

    setTimeout(() => {
      const droppedPiece: Tetromino = {
        ...(currentPiece as Tetromino),
        y: targetY
      };
      
      hardDropSound.play();
      const newBoard = placePiece(droppedPiece, board);
      const clearedBoard = clearLines(newBoard);
      setBoard(clearedBoard);
      
      if (droppedPiece.y <= 1) {
        setGameOver(true);
        setGameStarted(false);
        bgm.stop();
        return;
      }
      
      setCurrentPiece(nextPiece);
      setNextPiece(createRandomTetromino());
      setScore(prev => prev + dropDistance * 2);
      setAnimatedPieceY(null);
    }, 200);
  }, [currentPiece, board, gameOver, isPaused, checkCollision, placePiece, clearLines, nextPiece, createRandomTetromino]);

  useEffect(() => {
    if (currentPiece) {
      setAnimatedPieceY(currentPiece.y);
    } else {
      setAnimatedPieceY(null);
    }
  }, [currentPiece]);

  // 게임 루프
  const gameLoop = useCallback(() => {
    movePiece('down');
  }, [movePiece]);

  // BGM 관리
  useEffect(() => {
    if (gameStarted && !isPaused && !gameOver) {
      bgm.play();
    } else if (gameOver) {
      bgm.stop();
    } else if (isPaused) {
      bgm.pause();
    }
    return () => {};
  }, [gameStarted, isPaused, gameOver]);

  // 라인 클리어 애니메이션
  useEffect(() => {
    if (clearingLines.length > 0) {
      const totalAnimationDuration = CLEAR_ANIMATION_DURATION + MAX_CLEAR_ANIMATION_DELAY;
      const clearedLineYs = [...clearingLines];
      const originalBoard = board;

      const animationTimeout = setTimeout(() => {
        handleLineClearComplete(clearedLineYs.length, clearedLineYs, originalBoard);
      }, totalAnimationDuration * 1000);

      return () => clearTimeout(animationTimeout);
    }
  }, [clearingLines, handleLineClearComplete, board]);

  // 게임 루프 시작 및 정지
  useEffect(() => {
    if (gameStarted && !gameOver && !isPaused) {
      gameLoopRef.current = setInterval(gameLoop, dropTimeRef.current);
    } else if (!gameStarted || gameOver || isPaused) {
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
            rotateSound.play();
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
  }, [gameStarted, gameOver, movePiece, rotatePiece, hardDrop]);

  // 보드 렌더링
  const renderBoard = useCallback(() => {
    const displayBoard: (number | string)[][] = board.map(row => [...row]);
    return displayBoard;
  }, [board]);

  const displayBoard = renderBoard();

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-900 text-white font-mono">
      <h1 className="text-5xl font-bold mb-8 text-center">테트리스</h1>
      <div className="bg-gray-800 p-2 flex justify-between items-center w-full max-w-screen-lg">
        <div className="text-xl font-bold">TETRIS</div>
        <div className="flex gap-4 text-sm">
          <div>SCORE: {score}</div>
          <div>LEVEL: {level}</div>
          <div>LINES: {lines}</div>
        </div>
      </div>

      <div className="relative flex flex-col md:flex-row items-center md:items-start space-y-4 md:space-y-0 md:space-x-8 flex-grow justify-center p-4 w-full max-w-screen-lg">
        <style jsx>{`
          .tetris-cyan {
            background: linear-gradient(135deg, #67e8f9 0%, #22d3ee 50%, #0891b2 100%);
            border-top: 2px solid #a5f3fc;
            border-left: 2px solid #a5f3fc;
            border-right: 2px solid #0891b2;
            border-bottom: 2px solid #0891b2;
            box-shadow: inset -2px -2px 4px rgba(8, 145, 178, 0.3);
          }
          .tetris-yellow {
            background: linear-gradient(135deg, #fef08a 0%, #facc15 50%, #ca8a04 100%);
            border-top: 2px solid #fef3c7;
            border-left: 2px solid #fef3c7;
            border-right: 2px solid #ca8a04;
            border-bottom: 2px solid #ca8a04;
            box-shadow: inset -2px -2px 4px rgba(202, 138, 4, 0.3);
          }
          .tetris-purple {
            background: linear-gradient(135deg, #c084fc 0%, #a855f7 50%, #7c3aed 100%);
            border-top: 2px solid #ddd6fe;
            border-left: 2px solid #ddd6fe;
            border-right: 2px solid #7c3aed;
            border-bottom: 2px solid #7c3aed;
            box-shadow: inset -2px -2px 4px rgba(124, 58, 237, 0.3);
          }
          .tetris-green {
            background: linear-gradient(135deg, #86efac 0%, #22c55e 50%, #15803d 100%);
            border-top: 2px solid #bbf7d0;
            border-left: 2px solid #bbf7d0;
            border-right: 2px solid #15803d;
            border-bottom: 2px solid #15803d;
            box-shadow: inset -2px -2px 4px rgba(21, 128, 61, 0.3);
          }
          .tetris-red {
            background: linear-gradient(135deg, #fca5a5 0%, #ef4444 50%, #dc2626 100%);
            border-top: 2px solid #fecaca;
            border-left: 2px solid #fecaca;
            border-right: 2px solid #dc2626;
            border-bottom: 2px solid #dc2626;
            box-shadow: inset -2px -2px 4px rgba(220, 38, 38, 0.3);
          }
          .tetris-blue {
            background: linear-gradient(135deg, #93c5fd 0%, #3b82f6 50%, #1d4ed8 100%);
            border-top: 2px solid #bfdbfe;
            border-left: 2px solid #bfdbfe;
            border-right: 2px solid #1d4ed8;
            border-bottom: 2px solid #1d4ed8;
            box-shadow: inset -2px -2px 4px rgba(29, 78, 216, 0.3);
          }
          .tetris-orange {
            background: linear-gradient(135deg, #fdba74 0%, #f97316 50%, #c2410c 100%);
            border-top: 2px solid #fed7aa;
            border-left: 2px solid #fed7aa;
            border-right: 2px solid #c2410c;
            border-bottom: 2px solid #c2410c;
            box-shadow: inset -2px -2px 4px rgba(194, 65, 12, 0.3);
          }
        `}</style>

        <div className="flex-1 flex justify-center">
          <div className="flex-1 flex items-center justify-center p-2">
            <div 
              className="grid gap-0 bg-black"
              style={{
                gridTemplateColumns: `repeat(${BOARD_WIDTH}, 1fr)`,
                gridTemplateRows: `repeat(${BOARD_HEIGHT}, 1fr)`,
                width: `${BOARD_WIDTH * blockSize}px`,
                height: `${BOARD_HEIGHT * blockSize}px`,
                position: 'relative',
              }}
            >
              {displayBoard.map((row, y) =>
                row.map((cell, x) => {
                  const isClearingCell = clearingLines.includes(y);
                  if (isClearingCell && cell !== 0) {
                    const cellColor = COLOR_MAP[cell as keyof typeof COLOR_MAP] || 'transparent';
                    return (
                      <motion.div
                        key={`clearing-${y}-${x}-animated`}
                        initial={{ opacity: 1, rotate: 0, backgroundColor: cellColor }}
                        animate={{ opacity: 0, rotate: 5, backgroundColor: 'rgba(0, 0, 0, 0)' }}
                        transition={{
                          duration: CLEAR_ANIMATION_DURATION,
                          delay: x * CLEAR_ANIMATION_CELL_DELAY_FACTOR,
                          ease: "easeOut"
                        }}
                        style={{
                          position: 'absolute',
                          left: x * blockSize,
                          top: y * blockSize,
                          width: `${blockSize}px`,
                          height: `${blockSize}px`,
                          zIndex: 30,
                          backgroundImage: 'none',
                        }}
                      />
                    );
                  } else {
                    return (
                      <div
                        key={`${y}-${x}`}
                        className={`${cell ? cell : 'bg-gray-900 border border-gray-800'}`}
                        style={{
                          width: `${blockSize}px`,
                          height: `${blockSize}px`,
                        }}
                      />
                    );
                  }
                })
              )}

              {currentPiece && animatedPieceY !== null && !gameOver && !isPaused && (
                <motion.div
                  initial={{ y: currentPiece.y * blockSize }}
                  animate={{ y: animatedPieceY * blockSize }}
                  transition={{ duration: 0.2, ease: "linear" }}
                  style={{
                    position: 'absolute',
                    left: currentPiece.x * blockSize,
                    top: 0,
                    width: currentPiece.shape[0].length * blockSize,
                    height: currentPiece.shape.length * blockSize,
                  }}
                >
                  {currentPiece.shape.map((row, y) =>
                    row.map((cell, x) => {
                      if (cell) {
                        return (
                          <div
                            key={`${y}-${x}`}
                            className={`${currentPiece.color}`}
                            style={{
                              position: 'absolute',
                              left: x * blockSize,
                              top: y * blockSize,
                              width: `${blockSize}px`,
                              height: `${blockSize}px`,
                            }}
                          />
                        );
                      }
                      return null;
                    })
                  )}
                </motion.div>
              )}
            </div>

            {gameOver && (
              <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-2xl font-bold mb-4">GAME OVER</div>
                  <button
                    onClick={initGame}
                    className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded font-bold"
                  >
                    Play Again
                  </button>
                </div>
              </div>
            )}

            {isPaused && gameStarted && !gameOver && (
              <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center">
                <div className="text-2xl font-bold">PAUSED</div>
              </div>
            )}

            {!gameStarted && !gameOver && (
              <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-2xl font-bold mb-4">TETRIS</div>
                  <button
                    onClick={initGame}
                    className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded font-bold"
                  >
                    Start Game
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className={`${isLandscape ? 'w-32' : 'w-full'} bg-gray-800 p-4 flex flex-col gap-4`}>
            <div>
              <div className="text-sm font-bold mb-2">NEXT</div>
              <div className="bg-black border border-gray-600 p-2 h-16 flex items-center justify-center">
                {nextPiece && (
                  <div 
                    className="grid gap-0"
                    style={{
                      gridTemplateColumns: `repeat(${nextPiece.shape[0].length}, ${blockSize * 0.5}px)`,
                      gridTemplateRows: `repeat(${nextPiece.shape.length}, ${blockSize * 0.5}px)`
                    }}
                  >
                    {nextPiece.shape.map((row, y) =>
                      row.map((cell, x) => (
                        <div
                          key={`${y}-${x}`}
                          className={`${cell ? nextPiece.color : 'bg-transparent'}`}
                          style={{
                            width: `${blockSize * 0.5}px`,
                            height: `${blockSize * 0.5}px`,
                          }}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => setIsPaused(!isPaused)}
              disabled={!gameStarted || gameOver}
              className="bg-gray-600 hover:bg-gray-700 disabled:bg-gray-700 px-3 py-2 rounded text-sm"
            >
              {isPaused ? '▶' : '⏸'}
            </button>
          </div>
        </div>

        <div className="bg-gray-800 p-4 flex justify-center items-center gap-8 md:hidden w-full">
          <div className="grid grid-cols-3 gap-2">
            <div></div>
            <button
              onTouchStart={(e) => {
                e.preventDefault();
                const rotatedPiece = rotatePiece(currentPiece);
                if (rotatedPiece && !checkCollision(rotatedPiece, board)) {
                  setCurrentPiece(rotatedPiece);
                  rotateSound.play();
                }
              }}
              className="bg-gray-600 hover:bg-gray-700 active:bg-gray-500 p-4 rounded flex items-center justify-center"
            >
              <ChevronUp size={32} />
            </button>
            <div></div>

            <button
              onTouchStart={(e) => {
                e.preventDefault();
                movePiece('left');
              }}
              className="bg-gray-600 hover:bg-gray-700 active:bg-gray-500 p-4 rounded flex items-center justify-center"
            >
              <ChevronLeft size={32} />
            </button>
            <button
              onTouchStart={(e) => {
                e.preventDefault();
                movePiece('down');
              }}
              className="bg-gray-600 hover:bg-gray-700 active:bg-gray-500 p-4 rounded flex items-center justify-center"
            >
              <ChevronDown size={32} />
            </button>
            <button
              onTouchStart={(e) => {
                e.preventDefault();
                movePiece('right');
              }}
              className="bg-gray-600 hover:bg-gray-700 active:bg-gray-500 p-4 rounded flex items-center justify-center"
            >
              <ChevronRight size={32} />
            </button>
          </div>

          <button
            onTouchStart={(e) => {
              e.preventDefault();
              hardDrop();
            }}
            className="bg-red-600 hover:bg-red-700 active:bg-red-500 px-8 py-4 rounded font-bold text-lg"
          >
            DOWN
          </button>
        </div>
      </div>
    </div>
  );
};

export default TetrisGame;