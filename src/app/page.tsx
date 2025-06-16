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
const collapseSound = new Howl({ src: ['/sound/collapse.mp3'] }); // Use for piece placement/collision
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

const CLEAR_ANIMATION_DURATION = 0.1; // 각 셀의 애니메이션 지속 시간
const CLEAR_ANIMATION_CELL_DELAY_FACTOR = 0.03; // 셀 간의 지연 시간
const MAX_CLEAR_ANIMATION_DELAY = BOARD_WIDTH * CLEAR_ANIMATION_CELL_DELAY_FACTOR;

// 테트리스 블록 색상 매핑 (애니메이션을 위해 단색으로 변환)
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
  const [blockSize, setBlockSize] = useState(30); // 새로운 blockSize 상태 변수
  
  const gameLoopRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const dropTimeRef = useRef<number>(1000);

  // blockSize 동적 계산 및 업데이트 useEffect
  useEffect(() => {
    const calculateBlockSize = () => {
      // 모바일 환경을 고려하여 화면 크기에 비례하여 블록 크기 계산
      // (예시 값이며, 실제 화면 비율과 UI 구성에 따라 미세 조정 필요)
      const maxBoardWidth = window.innerWidth * 0.8; // 화면 너비의 80% 사용
      const maxBoardHeight = window.innerHeight * 0.7; // 화면 높이의 70% 사용 (상단 제목, 하단 컨트롤러 고려)

      const calculatedWidthSize = Math.floor(maxBoardWidth / BOARD_WIDTH);
      const calculatedHeightSize = Math.floor(maxBoardHeight / BOARD_HEIGHT);

      // 너비와 높이 중 작은 값을 선택하여 보드가 화면을 벗어나지 않도록 함
      setBlockSize(Math.max(15, Math.min(calculatedWidthSize, calculatedHeightSize))); // 최소 15px
    };

    calculateBlockSize(); // 초기 로드 시 계산
    window.addEventListener('resize', calculateBlockSize); // 화면 크기 변경 시 재계산

    return () => {
      window.removeEventListener('resize', calculateBlockSize); // 정리 함수
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

    // Check for immediate game over upon spawning
    // If the initial piece at its spawn position (y=0) immediately collides with the board
    // when attempting to move down by 1 unit, then it's game over.
    // This signifies that the spawn area is blocked.
    if (checkCollision(initialPiece, newBoard, 0, 1)) {
      setGameOver(true);
      setGameStarted(false);
      bgm.stop(); // Stop BGM on immediate game over
      // Do not set currentPiece or nextPiece if game over
      return; // Exit early
    }

    setCurrentPiece(initialPiece);
    setNextPiece(createRandomTetromino());
    setScore(0);
    setLines(0);
    setLevel(1);
    setGameOver(false); // Ensure this is false if not game over
    setGameStarted(true);
    dropTimeRef.current = 1000;
    console.log('initGame: bgm.play() 호출 시도');
    // bgm.play(); // BGM 재생은 useEffect에서 관리
  }, [createRandomTetromino, checkCollision]);

  // 블록 회전
  const rotatePiece = useCallback((piece: Tetromino | null): Tetromino | null => {
    if (!piece) return null; // piece가 null이면 null 반환
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
      lineClearSound.play(); // 라인 클리어 시 사운드 재생
      setClearingLines(linesToClear);
      // 실제 보드 업데이트는 애니메이션 완료 후 handleLineClearComplete에서 처리
      return boardState; // 애니메이션 중에는 기존 보드를 반환
    }
    
    return boardState; // 지워진 라인이 없으면 원래 보드 반환
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
    setClearingLines([]); // 애니메이션 완료 후 상태 초기화
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
        moveSound.play(); // 좌우 이동 시 사운드 재생
      }
    } else if (direction === 'down') {
      collapseSound.play(); // 블록이 바닥에 닿으면 사운드 재생
      // 블록이 바닥에 닿으면 고정
      const newBoard = placePiece(currentPiece, board);
      const linesToClear = newBoard.filter(row => row.every(cell => cell !== 0)).length;
      const finalBoard = clearLines(newBoard);

      if (linesToClear === 0) {
        // 라인이 지워지지 않았다면 즉시 다음 블록 생성 및 게임 오버 체크
        setBoard(finalBoard);
        if (currentPiece.y <= 1) {
          setGameOver(true);
          setGameStarted(false);
          console.log('게임 오버: bgm.stop() 호출 시도');
          bgm.stop(); // 게임 오버 시 BGM 정지
          return;
        }
        setCurrentPiece(nextPiece);
        setNextPiece(createRandomTetromino());
      } else {
        // 라인이 지워진다면 애니메이션 완료 후 처리
        // clearLines에서 setClearingLines를 호출했으므로, 여기서는 board를 즉시 업데이트하지 않습니다.
        // handleLineClearComplete가 호출될 때까지 기다립니다.
        // 여기서는 임시로 boardState를 그대로 반환하여, handleLineClearComplete에서 처리하도록 합니다.
      }
    }
  }, [currentPiece, board, gameOver, isPaused, checkCollision, placePiece, clearLines, nextPiece, createRandomTetromino, bgm, collapseSound]);

  // 하드 드롭 (한번에 최하단으로 이동)
  const hardDrop = useCallback(() => {
    if (!currentPiece || gameOver || isPaused) return;
    
    let dropDistance = 0;
    while (!checkCollision(currentPiece, board, 0, dropDistance + 1)) {
      dropDistance++;
    }
    
    const targetY = currentPiece.y + dropDistance;

    setAnimatedPieceY(targetY); // 애니메이션 목표 Y 설정

    // 애니메이션 완료 후 실행될 로직을 setTimeout으로 지연
    setTimeout(() => {
      const droppedPiece: Tetromino = {
        ...(currentPiece as Tetromino),
        y: targetY
      };
      
      hardDropSound.play(); // 하드 드롭 시 사운드 재생

      const newBoard = placePiece(droppedPiece, board);
      const clearedBoard = clearLines(newBoard);
      setBoard(clearedBoard);
      
      if (droppedPiece.y <= 1) {
        setGameOver(true);
        setGameStarted(false);
        console.log('게임 오버 (하드 드롭): bgm.stop() 호출 시도');
        bgm.stop();
        return;
      }
      
      setCurrentPiece(nextPiece);
      setNextPiece(createRandomTetromino());
      setScore(prev => prev + dropDistance * 2); // 하드 드롭으로 이동한 거리만큼 점수 추가
      setAnimatedPieceY(null); // 애니메이션 완료 후 초기화
    }, 200); // 애니메이션 지속 시간 (framer-motion transition duration과 일치)

  }, [currentPiece, board, gameOver, isPaused, checkCollision, placePiece, clearLines, nextPiece, createRandomTetromino, bgm, hardDropSound]);

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

  // 게임 시작 시 BGM 관리
  useEffect(() => {
    if (gameStarted && !isPaused && !gameOver) {
      bgm.play();
    } else if (gameOver) {
      bgm.stop();
    } else if (isPaused) {
      bgm.pause();
    }
    // cleanup 함수는 이펙트가 정리될 때 호출되어 불필요한 BGM 재생을 중지합니다.
    return () => {
      // 컴포넌트 언마운트 시 BGM 정지 (선택 사항)
      // bgm.stop(); // 이전에 주석 처리됨. 게임 오버 시 bgm.stop()이 호출되므로 여기서는 필요 없을 수 있습니다.
    };
  }, [gameStarted, isPaused, gameOver]);

  // 라인 클리어 애니메이션 처리
  useEffect(() => {
    if (clearingLines.length > 0) {
      const totalAnimationDuration = CLEAR_ANIMATION_DURATION + MAX_CLEAR_ANIMATION_DELAY;
      const clearedLineYs = [...clearingLines]; // 클로저 문제 방지를 위해 복사
      const originalBoard = board; // 클로저를 위해 현재 보드 상태 저장

      const animationTimeout = setTimeout(() => {
        handleLineClearComplete(clearedLineYs.length, clearedLineYs, originalBoard);
      }, totalAnimationDuration * 1000); // 밀리초 단위로 변환

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
  }, [gameStarted, gameOver, isPaused, gameLoop, dropTimeRef.current]);

  // 키보드 이벤트 핸들러 등록
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
          const rotatedPieceFromArrowUp = rotatePiece(currentPiece);
          if (rotatedPieceFromArrowUp && !checkCollision(rotatedPieceFromArrowUp, board)) {
            setCurrentPiece(rotatedPieceFromArrowUp);
            rotateSound.play(); // 회전 시 사운드 재생
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

  // 보드 렌더링 (현재 블록 포함)
  const renderBoard = useCallback(() => {
    const displayBoard: (number | string)[][] = board.map(row => [...row]);
    
    return displayBoard;
  }, [board]);

  const displayBoard = renderBoard();

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-900 text-white font-mono">
      <h1 className="text-5xl font-bold mb-8 text-center">테트리스</h1>
      {/* SCORE, LEVEL, LINES 헤더의 새로운 위치 */}
      <div className="bg-gray-800 p-2 flex justify-between items-center">
        <div className="text-xl font-bold">TETRIS</div>
        <div className="flex gap-4 text-sm">
          <div>SCORE: {score}</div>
          <div>LEVEL: {level}</div>
          <div>LINES: {lines}</div>
        </div>
      </div>

      {/* 메인 게임 영역 (보드 + 사이드바): 이 div가 flex-grow를 가져야 합니다. */}
      <div className="relative flex flex-row items-start space-x-8 flex-grow justify-center p-4 w-full max-w-screen-lg">
        {/* 3D 블록 스타일 */}
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

        {/* 메인 게임 영역 */}
        <div className="flex-1 flex">
          {/* 게임 보드 */}
          <div className="flex-1 flex items-center justify-center p-4">
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
                    // 일반 셀 렌더링 (비어 있거나 고정된 블록)
                    return (
                      <div
                        key={`${y}-${x}`}
                        className={`${
                          cell ? cell : 'bg-gray-900 border border-gray-800'
                        }`}
                        style={{
                          width: `${blockSize}px`,
                          height: `${blockSize}px`,
                        }}
                      />
                    );
                  }
                })
              )}

              {/* 현재 블록 렌더링 (framer-motion 적용) */}
              {currentPiece && animatedPieceY !== null && !gameOver && !isPaused && (
                <motion.div
                  initial={{ y: currentPiece.y * blockSize }} // 시작 Y 위치 (BLOCK_SIZE 대신 blockSize 사용)
                  animate={{ y: animatedPieceY * blockSize }} // 목표 Y 위치 (BLOCK_SIZE 대신 blockSize 사용)
                  transition={{ duration: 0.2, ease: "linear" }} // 애니메이션 지속 시간 및 이징
                  style={{
                    position: 'absolute',
                    left: currentPiece.x * blockSize,
                    top: 0, // 초기 위치는 0으로 설정하고 animatedPieceY로 조절
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

            {/* 게임 오버 오버레이 */}
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

            {/* 일시정지 오버레이 */}
            {isPaused && gameStarted && !gameOver && (
              <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center">
                <div className="text-2xl font-bold">PAUSED</div>
              </div>
            )}

            {/* 시작 화면 */}
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

          {/* 사이드바 */}
          <div className="w-32 bg-gray-800 p-4 flex flex-col gap-4">
            {/* Next 블록 */}
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
                          className={`${
                            cell ? nextPiece.color : 'bg-transparent'
                          }`}
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

            {/* 일시정지 버튼 */}
            <button
              onClick={() => setIsPaused(!isPaused)}
              disabled={!gameStarted || gameOver}
              className="bg-gray-600 hover:bg-gray-700 disabled:bg-gray-700 px-3 py-2 rounded text-sm"
            >
              {isPaused ? '▶' : '⏸'}
            </button>
          </div>
        </div>
      </div> {/* 메인 게임 영역 div의 끝 */}

      {/* 모바일 컨트롤: 이제 메인 게임 영역 밖에 있습니다. */}
      <div className="bg-gray-800 p-4 flex justify-center items-center gap-8 md:hidden w-full">
        {/* 방향키 패드 */}
        <div className="grid grid-cols-3 gap-1">
          <div></div>
          <button
            onTouchStart={(e) => {
              e.preventDefault();
              const rotatedPieceFromTouch = rotatePiece(currentPiece);
              if (rotatedPieceFromTouch && !checkCollision(rotatedPieceFromTouch, board)) {
                setCurrentPiece(rotatedPieceFromTouch);
                rotateSound.play(); // 회전 시 사운드 재생
              }
            }}
            className="bg-gray-600 hover:bg-gray-700 active:bg-gray-500 p-3 rounded flex items-center justify-center"
          >
            <ChevronUp size={24} />
          </button>
          <div></div>

          <button
            onTouchStart={(e) => {
              e.preventDefault();
              movePiece('left');
            }}
            className="bg-gray-600 hover:bg-gray-700 active:bg-gray-500 p-3 rounded flex items-center justify-center"
          >
            <ChevronLeft size={24} />
          </button>
          <button
            onTouchStart={(e) => {
              e.preventDefault();
              movePiece('down');
            }}
            className="bg-gray-600 hover:bg-gray-700 active:bg-gray-500 p-3 rounded flex items-center justify-center"
          >
            <ChevronDown size={24} />
          </button>
          <button
            onTouchStart={(e) => {
              e.preventDefault();
              movePiece('right');
            }}
            className="bg-gray-600 hover:bg-gray-700 active:bg-gray-500 p-3 rounded flex items-center justify-center"
          >
            <ChevronRight size={24} />
          </button>
        </div>

        {/* DOWN 버튼 */}
        <button
          onTouchStart={(e) => {
            e.preventDefault();
            hardDrop();
          }}
          className="bg-red-600 hover:bg-red-700 active:bg-red-500 px-6 py-4 rounded font-bold text-lg"
        >
          DOWN
        </button>
      </div>
    </div>
  );
};

export default TetrisGame;