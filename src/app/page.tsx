"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

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
  const [isLandscape, setIsLandscape] = useState<boolean>(false);
  const [viewportHeight, setViewportHeight] = useState<number>(0);

  const gameLoopRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const dropTimeRef = useRef<number>(1000);

  // 뷰포트 높이 계산 (더 정확한 방법)
  const getViewportHeight = useCallback(() => {
    // CSS의 100vh 대신 실제 뷰포트 높이 사용
    return window.visualViewport ? window.visualViewport.height : window.innerHeight;
  }, []);

  useEffect(() => {
    const calculateLayout = () => {
      const vw = window.innerWidth;
      const vh = getViewportHeight();
      const newIsLandscape = vw > vh;
      
      setIsLandscape(newIsLandscape);
      setViewportHeight(vh);

      // 안전 여백 (상태바, 노치 등을 고려)
      const safeTop = 40; // 상태바 등
      const safeBottom = newIsLandscape ? 20 : 60; // 네비게이션 바 등
      
      // UI 요소들의 예상 높이
      const titleHeight = 60; // 제목
      const headerHeight = 50; // 점수 표시
      const controlsHeight = newIsLandscape ? 0 : 120; // 모바일 컨트롤
      const padding = 16;
      
      // 사용 가능한 공간 계산
      const availableHeight = vh - safeTop - safeBottom - titleHeight - headerHeight - controlsHeight - (padding * 2);
      const availableWidth = newIsLandscape ? vw * 0.6 : vw - (padding * 2); // 가로모드에서는 60% 사용
      
      // 블록 크기 계산 (더 보수적으로)
      const widthBasedSize = Math.floor(availableWidth / BOARD_WIDTH);
      const heightBasedSize = Math.floor(availableHeight / BOARD_HEIGHT);
      const calculatedSize = Math.min(widthBasedSize, heightBasedSize);
      
      // 최소/최대 크기 제한
      const newBlockSize = Math.max(15, Math.min(calculatedSize, 35));
      setBlockSize(newBlockSize);
    };

    calculateLayout();
    
    // 리사이즈 이벤트들
    const handleResize = () => {
      // 약간의 딜레이를 주어 브라우저가 완전히 리사이즈된 후 계산
      setTimeout(calculateLayout, 100);
    };

    const handleOrientationChange = () => {
      // 오리엔테이션 변경 시 더 긴 딜레이
      setTimeout(calculateLayout, 300);
    };

    const handleVisualViewportChange = () => {
      // 가상 키보드 등으로 인한 뷰포트 변경
      setTimeout(calculateLayout, 100);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);
    
    // Visual Viewport API 지원 시 사용
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleVisualViewportChange);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleVisualViewportChange);
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
  const clearLines = useCallback((boardState: (number | string)[][]): { board: (number | string)[][], clearedCount: number } => {
    const newBoard = [...boardState];
    let clearedCount = 0;
    
    for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
      if (newBoard[y].every(cell => cell !== 0)) {
        newBoard.splice(y, 1);
        newBoard.unshift(Array(BOARD_WIDTH).fill(0));
        clearedCount++;
        y++; // 같은 라인을 다시 체크
      }
    }
    
    return { board: newBoard, clearedCount };
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
    } else if (direction === 'down') {
      const newBoard = placePiece(currentPiece, board);
      const { board: clearedBoard, clearedCount } = clearLines(newBoard);
      
      setBoard(clearedBoard);
      
      if (clearedCount > 0) {
        const points = [0, 40, 100, 300, 1200][clearedCount] * level;
        setScore(prev => prev + points);
        setLines(prev => {
          const newLines = prev + clearedCount;
          const newLevel = Math.floor(newLines / 10) + 1;
          setLevel(newLevel);
          dropTimeRef.current = Math.max(50, 1000 - (newLevel - 1) * 100);
          return newLines;
        });
      }

      if (currentPiece.y <= 1) {
        setGameOver(true);
        setGameStarted(false);
        return;
      }
      
      setCurrentPiece(nextPiece);
      setNextPiece(createRandomTetromino());
    }
  }, [currentPiece, board, gameOver, isPaused, checkCollision, placePiece, clearLines, nextPiece, createRandomTetromino, level]);

  // 하드 드롭
  const hardDrop = useCallback(() => {
    if (!currentPiece || gameOver || isPaused) return;
    
    let dropDistance = 0;
    while (!checkCollision(currentPiece, board, 0, dropDistance + 1)) {
      dropDistance++;
    }
    
    const droppedPiece: Tetromino = {
      ...(currentPiece as Tetromino),
      y: currentPiece.y + dropDistance
    };
    
    const newBoard = placePiece(droppedPiece, board);
    const { board: clearedBoard, clearedCount } = clearLines(newBoard);
    
    setBoard(clearedBoard);
    
    if (clearedCount > 0) {
      const points = [0, 40, 100, 300, 1200][clearedCount] * level;
      setScore(prev => prev + points);
      setLines(prev => {
        const newLines = prev + clearedCount;
        const newLevel = Math.floor(newLines / 10) + 1;
        setLevel(newLevel);
        dropTimeRef.current = Math.max(50, 1000 - (newLevel - 1) * 100);
        return newLines;
      });
    }
    
    if (droppedPiece.y <= 1) {
      setGameOver(true);
      setGameStarted(false);
      return;
    }
    
    setCurrentPiece(nextPiece);
    setNextPiece(createRandomTetromino());
    setScore(prev => prev + dropDistance * 2);
  }, [currentPiece, board, gameOver, isPaused, checkCollision, placePiece, clearLines, nextPiece, createRandomTetromino, level]);

  // 게임 루프
  const gameLoop = useCallback(() => {
    movePiece('down');
  }, [movePiece]);

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
  }, [gameStarted, gameOver, movePiece, rotatePiece, hardDrop, currentPiece, board, checkCollision]);

  // 보드 렌더링
  const renderBoard = useCallback(() => {
    const displayBoard: (number | string)[][] = board.map(row => [...row]);
    
    // 현재 피스 표시
    if (currentPiece && !gameOver && !isPaused) {
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
    
    return displayBoard;
  }, [board, currentPiece, gameOver, isPaused]);

  const displayBoard = renderBoard();

  return (
    <div
      className={`flex bg-gray-900 text-white font-mono overflow-hidden ${isLandscape ? 'flex-row' : 'flex-col'} p-4`}
      style={{
        height: viewportHeight || '100vh',
        minHeight: viewportHeight || '100vh',
        maxHeight: viewportHeight || '100vh',
      }}
    >
      <style jsx>{`
        .tetris-cyan {
          background: linear-gradient(135deg, #67e8f9 0%, #22d3ee 50%, #0891b2 100%);
          border-top: 1px solid #a5f3fc;
          border-left: 1px solid #a5f3fc;
          border-right: 1px solid #0891b2;
          border-bottom: 1px solid #0891b2;
        }
        .tetris-yellow {
          background: linear-gradient(135deg, #fef08a 0%, #facc15 50%, #ca8a04 100%);
          border-top: 1px solid #fef3c7;
          border-left: 1px solid #fef3c7;
          border-right: 1px solid #ca8a04;
          border-bottom: 1px solid #ca8a04;
        }
        .tetris-purple {
          background: linear-gradient(135deg, #c084fc 0%, #a855f7 50%, #7c3aed 100%);
          border-top: 1px solid #ddd6fe;
          border-left: 1px solid #ddd6fe;
          border-right: 1px solid #7c3aed;
          border-bottom: 1px solid #7c3aed;
        }
        .tetris-green {
          background: linear-gradient(135deg, #86efac 0%, #22c55e 50%, #15803d 100%);
          border-top: 1px solid #bbf7d0;
          border-left: 1px solid #bbf7d0;
          border-right: 1px solid #15803d;
          border-bottom: 1px solid #15803d;
        }
        .tetris-red {
          background: linear-gradient(135deg, #fca5a5 0%, #ef4444 50%, #dc2626 100%);
          border-top: 1px solid #fecaca;
          border-left: 1px solid #fecaca;
          border-right: 1px solid #dc2626;
          border-bottom: 1px solid #dc2626;
        }
        .tetris-blue {
          background: linear-gradient(135deg, #93c5fd 0%, #3b82f6 50%, #1d4ed8 100%);
          border-top: 1px solid #bfdbfe;
          border-left: 1px solid #bfdbfe;
          border-right: 1px solid #1d4ed8;
          border-bottom: 1px solid #1d4ed8;
        }
        .tetris-orange {
          background: linear-gradient(135deg, #fdba74 0%, #f97316 50%, #ea580c 100%);
          border-top: 1px solid #fed7aa;
          border-left: 1px solid #fed7aa;
          border-right: 1px solid #ea580c;
          border-bottom: 1px solid #ea580c;
        }
        .tetris-gray {
          background: linear-gradient(135deg, #d1d5db 0%, #9ca3af 50%, #6b7280 100%);
          border-top: 1px solid #e5e7eb;
          border-left: 1px solid #e5e7eb;
          border-right: 1px solid #6b7280;
          border-bottom: 1px solid #6b7280;
        }
      `}</style>
      
      {/* 게임 정보 및 다음 블록 (가로/세로 공통) */}
      <div className={`flex flex-col ${isLandscape ? 'w-1/4 h-full p-4 justify-between' : 'w-full h-auto p-4 mx-auto'}`}>
        <h1 className="text-4xl font-bold text-center text-green-400 mb-4 drop-shadow-lg">
          Tetris Game
        </h1>
        
        {/* 게임 정보 및 다음 블록 */}
        <div className={`flex justify-around items-center mb-4 ${isLandscape ? 'flex-col' : 'flex-row'}`}>
          <div className="text-lg">Score: <span className="font-bold text-yellow-400">{score}</span></div>
          <div className="text-lg">Lines: <span className="font-bold text-cyan-400">{lines}</span></div>
          <div className="text-lg">Level: <span className="font-bold text-purple-400">{level}</span></div>
          
          {nextPiece && (
            <div className={`mt-4 ${isLandscape ? 'text-center' : ''}`}>
              <h3 className="text-md mb-1 text-gray-300">Next</h3>
              <div 
                className="bg-gray-800 border-2 border-gray-700 p-1 rounded-sm shadow-inner"
                style={{
                  width: `${blockSize * 4}px`,
                  height: `${blockSize * 4}px`,
                  display: 'grid',
                  gridTemplateColumns: `repeat(${nextPiece.shape[0].length}, ${blockSize}px)`,
                  gridTemplateRows: `repeat(${nextPiece.shape.length}, ${blockSize}px)`,
                  margin: 'auto'
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
                        width: `${blockSize}px`,
                        height: `${blockSize}px`,
                        boxSizing: 'border-box'
                      }}
                    />
                  ))
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* 세로모드 컨트롤 (여기에만 배치) */}
        {!isLandscape && (
          <div className="bg-gray-800 p-2 flex flex-col gap-1 mt-4">
            <div className="grid grid-cols-3 gap-1 text-xs">
              <div></div>
              <button
                onTouchStart={(e) => {
                  e.preventDefault();
                  const rotatedPiece = rotatePiece(currentPiece);
                  if (rotatedPiece && !checkCollision(rotatedPiece, board)) {
                    setCurrentPiece(rotatedPiece);
                  }
                }}
                className="bg-gray-600 active:bg-gray-500 p-2 rounded flex items-center justify-center"
              >
                <ChevronUp size={16} />
              </button>
              <div></div>

              <button
                onTouchStart={(e) => {
                  e.preventDefault();
                  movePiece('left');
                }}
                className="bg-gray-600 active:bg-gray-500 p-2 rounded flex items-center justify-center"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onTouchStart={(e) => {
                  e.preventDefault();
                  movePiece('down');
                }}
                className="bg-gray-600 active:bg-gray-500 p-2 rounded flex items-center justify-center"
              >
                <ChevronDown size={16} />
              </button>
              <button
                onTouchStart={(e) => {
                  e.preventDefault();
                  movePiece('right');
                }}
                className="bg-gray-600 active:bg-gray-500 p-2 rounded flex items-center justify-center"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <button
              onTouchStart={(e) => {
                e.preventDefault();
                hardDrop();
              }}
              className="bg-red-600 active:bg-red-500 px-2 py-1 rounded font-bold text-xs"
            >
              DROP
            </button>
          </div>
        )}
      </div>

      {/* 게임 보드 */}
      <div
        className={`relative bg-gray-800 border-2 border-gray-700 rounded-sm shadow-lg ${isLandscape ? 'flex-shrink-0 flex-grow' : 'mx-auto'}`}
        style={{
          width: `${BOARD_WIDTH * blockSize}px`,
          height: `${BOARD_HEIGHT * blockSize}px`,
          display: 'grid',
          gridTemplateColumns: `repeat(${BOARD_WIDTH}, ${blockSize}px)`,
          gridTemplateRows: `repeat(${BOARD_HEIGHT}, ${blockSize}px)`,
          minWidth: `${BOARD_WIDTH * 15}px`,
          minHeight: `${BOARD_HEIGHT * 15}px`,
          maxWidth: `${BOARD_WIDTH * 35}px`,
          maxHeight: `${BOARD_HEIGHT * 35}px`,
          margin: isLandscape ? 'auto' : '0 auto',
          boxShadow: '0 0 15px rgba(0,255,0,0.5), 0 0 30px rgba(0,255,0,0.3), 0 0 45px rgba(0,255,0,0.1)'
        }}
      >
        {displayBoard.map((row, y) => (
          row.map((cell, x) => (
            <div
              key={`${y}-${x}`}
              className={`
                ${cell === 0 ? 'bg-gray-800' : cell}
                ${cell === 0 ? '' : 'border border-gray-700'}
              `}
              style={{
                width: `${blockSize}px`,
                height: `${blockSize}px`,
                boxSizing: 'border-box'
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
                  <p className="text-xl text-gray-300 mb-6">Press 'P' to Resume</p>
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
    </div>
  );
};

export default TetrisGame;