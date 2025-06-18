'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

// beforeinstallprompt 이벤트 타입 정의
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// 타입 정의 추가
interface Tetromino {
  shape: number[][];
  color: string;
  key?: string;
}

type BoardCell = string | 0;
type Board = BoardCell[][];
type Position = { x: number; y: number };

const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;
const TETROMINOS: Record<string, Omit<Tetromino, 'key'>> = {
  I: { shape: [[1, 1, 1, 1]], color: 'cyan' },
  O: { shape: [[1, 1], [1, 1]], color: 'yellow' },
  T: { shape: [[0, 1, 0], [1, 1, 1]], color: 'purple' },
  S: { shape: [[0, 1, 1], [1, 1, 0]], color: 'green' },
  Z: { shape: [[1, 1, 0], [0, 1, 1]], color: 'red' },
  J: { shape: [[1, 0, 0], [1, 1, 1]], color: 'blue' },
  L: { shape: [[0, 0, 1], [1, 1, 1]], color: 'orange' }
};

const TETROMINO_KEYS = Object.keys(TETROMINOS);

// 점수 계산 개선
const POINTS = {
  SINGLE: 100,
  DOUBLE: 300,
  TRIPLE: 500,
  TETRIS: 800,
  SOFT_DROP: 1,
  HARD_DROP: 2
};

// 효과음 파일 경로
const SOUND = {
  move: '/sound/move.mp3',
  rotate: '/sound/rotate.mp3',
  hardDrop: '/sound/hardDrop.mp3',
  lineClear: '/sound/lineClear.mp3',
  collapse: '/sound/collapse.mp3',
  bgm: '/sound/tetris_BGM.mp3',
};

// 1. 사운드 객체 캐싱 및 중첩 방지
const soundCache: Record<string, HTMLAudioElement> = {};
function safePlaySound(src: string, volume = 1, loop = false) {
  if (!soundCache[src]) {
    soundCache[src] = new Audio(src);
  }
  const audio = soundCache[src];
  if (!audio.paused) {
    audio.pause();
    audio.currentTime = 0;
  }
  audio.volume = volume;
  audio.loop = loop;
  audio.play();
  return audio;
}

// 2. 점수/레벨/효과음 유틸 함수 분리 (컴포넌트 외부)
function calcLevel(lines: number) {
  return Math.floor(lines / 10) + 1;
}

export default function TetrisGame() {
  const [board, setBoard] = useState<Board>(() => Array(BOARD_HEIGHT).fill(null).map(() => Array(BOARD_WIDTH).fill(0)));
  const [currentPiece, setCurrentPiece] = useState<Tetromino | null>(null);
  const [currentPosition, setCurrentPosition] = useState<Position>({ x: 0, y: 0 });
  const [nextPiece, setNextPiece] = useState<Tetromino | null>(null);

  const [score, setScore] = useState<number>(0);
  const [level, setLevel] = useState<number>(1);
  const [lines, setLines] = useState<number>(0);
  const [gameOver, setGameOver] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [gameStarted, setGameStarted] = useState<boolean>(false);
  
  // 7-bag 시스템을 위한 상태
  const bagRef = useRef<string[]>([]);

  const [bgmAudio, setBgmAudio] = useState<HTMLAudioElement | null>(null);

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);

  // 7-bag 랜덤 생성 시스템 (더 공정한 조각 분배)
  const createRandomPiece = useCallback((): Tetromino => {
    if (bagRef.current.length === 0) {
      bagRef.current = [...TETROMINO_KEYS].sort(() => Math.random() - 0.5);
    }
    const randomKey = bagRef.current.pop() as string;
    return {
      ...TETROMINOS[randomKey],
      key: randomKey
    };
  }, []);

  const rotatePiece = (piece: Tetromino): Tetromino => {
    const rotated = piece.shape[0].map((_: number, i: number) =>
      piece.shape.map((row: number[]) => row[i]).reverse()
    );
    return { ...piece, shape: rotated };
  };

  const isValidPosition = (board: Board, piece: Tetromino, pos: Position): boolean => {
    for (let y = 0; y < piece.shape.length; y++) {
      for (let x = 0; x < piece.shape[y].length; x++) {
        if (piece.shape[y][x]) {
          const newX = pos.x + x;
          const newY = pos.y + y;
          if (newX < 0 || newX >= BOARD_WIDTH || newY >= BOARD_HEIGHT) {
            return false;
          }
          if (newY >= 0 && board[newY][newX]) {
            return false;
          }
        }
      }
    }
    return true;
  };

  const placePiece = (board: Board, piece: Tetromino, pos: Position): Board => {
    const newBoard = board.map((row: BoardCell[]) => [...row]);
    for (let y = 0; y < piece.shape.length; y++) {
      for (let x = 0; x < piece.shape[y].length; x++) {
        if (piece.shape[y][x]) {
          const boardY = pos.y + y;
          const boardX = pos.x + x;
          if (boardY >= 0) {
            newBoard[boardY][boardX] = piece.color;
          }
        }
      }
    }
    return newBoard;
  };

  const clearLines = (board: Board): { board: Board; clearedLines: number } => {
    const newBoard = board.filter((row: BoardCell[]) => row.some((cell: BoardCell) => !cell));
    const clearedLines = BOARD_HEIGHT - newBoard.length;
    const emptyRows = Array(clearedLines).fill(null).map(() => Array(BOARD_WIDTH).fill(0));
    return { board: [...emptyRows, ...newBoard], clearedLines };
  };

  const spawnNewPiece = useCallback(() => {
    const piece = nextPiece || createRandomPiece();
    const newNextPiece = createRandomPiece();
    const startPos = { 
      x: Math.floor((BOARD_WIDTH - piece.shape[0].length) / 2), 
      y: 0 
    };
    
    setCurrentPiece(piece);
    setCurrentPosition(startPos);
    setNextPiece(newNextPiece);
    
    return { piece, startPos };
  }, [nextPiece, createRandomPiece]);

  // 3. BGM 관리 개선 (useEffect 내부)
  useEffect(() => {
    if (gameStarted && !gameOver && !isPaused) {
      if (!bgmAudio) {
        const audio = safePlaySound(SOUND.bgm, 0.3, true);
        setBgmAudio(audio);
      } else {
        bgmAudio.play();
      }
    } else {
      bgmAudio?.pause();
    }
    return () => {
      if (bgmAudio) {
        bgmAudio.pause();
        bgmAudio.src = "";
        setBgmAudio(null);
      }
    };
  }, [gameStarted, gameOver, isPaused, bgmAudio]);

  // 연속 이동을 위한 interval ref 추가
  const moveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // 이동
  const movePiece = useCallback((dx: number, dy: number, isPlayerMove = false) => {
    if (!currentPiece || gameOver || isPaused) return false;
    const newPos = { x: currentPosition.x + dx, y: currentPosition.y + dy };
    if (isValidPosition(board, currentPiece, newPos)) {
      setCurrentPosition(newPos);
      // 소프트 드롭 점수 (플레이어가 아래로 이동할 때)
      if (isPlayerMove && dy > 0) {
        setScore(prev => prev + POINTS.SOFT_DROP);
      }
      // 이동 효과음
      if (isPlayerMove) safePlaySound(SOUND.move, 0.5);
      return true;
    } else if (dy > 0) {
      // 아래로 이동할 수 없으면 조각 고정
      const newBoard = placePiece(board, currentPiece, currentPosition);
      const { board: clearedBoard, clearedLines } = clearLines(newBoard);
      setBoard(clearedBoard);
      setLines(prev => prev + clearedLines);
      // 고정 효과음 (바닥 도착)
      safePlaySound(SOUND.hardDrop, 0.7);
      // 라인 삭제 효과음
      if (clearedLines > 0) safePlaySound(SOUND.collapse, 0.7);
      // 개선된 점수 계산
      if (clearedLines > 0) {
        let points = 0;
        switch (clearedLines) {
          case 1: points = POINTS.SINGLE; break;
          case 2: points = POINTS.DOUBLE; break;
          case 3: points = POINTS.TRIPLE; break;
          case 4: points = POINTS.TETRIS; break;
        }
        setScore(prev => prev + points * level);
      }
      
      // 레벨 계산 수정
      const newLines = lines + clearedLines;
      const newLevel = calcLevel(newLines);
      setLevel(newLevel);
      
      // 새 조각 생성
      const { piece: newPiece, startPos } = spawnNewPiece();
      
      // 게임 오버 체크
      if (!isValidPosition(clearedBoard, newPiece, startPos)) {
        setGameOver(true);
        setGameStarted(false);
        // 게임오버 효과음
        safePlaySound(SOUND.collapse, 1);
      }
      
      return false;
    }
    return false;
  }, [currentPiece, currentPosition, board, gameOver, isPaused, level, lines, spawnNewPiece]);

  // 그 다음에 연속 이동 관련 함수들을 선언
  const startContinuousMove = useCallback((dx: number) => {
    if (moveIntervalRef.current) {
      clearInterval(moveIntervalRef.current);
    }
    
    movePiece(dx, 0, true);
    
    moveIntervalRef.current = setInterval(() => {
      movePiece(dx, 0, true);
    }, 100);
  }, [movePiece]);
  
  const stopContinuousMove = useCallback(() => {
    if (moveIntervalRef.current) {
      clearInterval(moveIntervalRef.current);
      moveIntervalRef.current = null;
    }
  }, []);

  // rotatePieceHandler 함수를 먼저 선언
  const rotatePieceHandler = useCallback(() => {
    if (!currentPiece || gameOver || isPaused) return;
    const rotatedPiece = rotatePiece(currentPiece);
    
    // 벽 킥 시도 (기본 위치, 왼쪽, 오른쪽, 위로 이동)
    const wallKicks = [
      { x: 0, y: 0 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: -1 },
      { x: -1, y: -1 },
      { x: 1, y: -1 }
    ];
    
    for (const kick of wallKicks) {
      const testPos = {
        x: currentPosition.x + kick.x,
        y: currentPosition.y + kick.y
      };
      
      if (isValidPosition(board, rotatedPiece, testPos)) {
        setCurrentPiece(rotatedPiece);
        setCurrentPosition(testPos);
        break;
      }
    }
  }, [currentPiece, board, currentPosition, gameOver, isPaused]);

  // 그 다음에 handleRotate 함수 선언
  const handleRotate = useCallback(() => {
    if (!currentPiece || gameOver || isPaused) return;
    
    // 연속 이동 중에도 회전이 가능하도록
    rotatePieceHandler();
    
    // 회전 효과음
    safePlaySound(SOUND.rotate, 0.5);
  }, [currentPiece, gameOver, isPaused, rotatePieceHandler]);

  // 컴포넌트 언마운트 시 interval 정리
  useEffect(() => {
    return () => {
      if (moveIntervalRef.current) {
        clearInterval(moveIntervalRef.current);
      }
    };
  }, []);

  const dropPiece = useCallback(() => {
    if (!currentPiece || gameOver || isPaused) return;
    
    let dropDistance = 0;
    let newY = currentPosition.y;
    
    // 하드 드롭 거리 계산
    while (isValidPosition(board, currentPiece, { ...currentPosition, y: newY + 1 })) {
      newY++;
      dropDistance++;
    }
    
    // 하드 드롭 점수 추가
    setScore(prev => prev + dropDistance * POINTS.HARD_DROP);
    
    // 하드 드롭 효과음
    safePlaySound(SOUND.hardDrop, 0.7);
    
    // 조각 즉시 고정
    const newBoard = placePiece(board, currentPiece, { ...currentPosition, y: newY });
    const { board: clearedBoard, clearedLines } = clearLines(newBoard);
    
    setBoard(clearedBoard);
    setLines(prev => prev + clearedLines);
    
    // 점수 계산
    if (clearedLines > 0) {
      let points = 0;
      switch (clearedLines) {
        case 1: points = POINTS.SINGLE; break;
        case 2: points = POINTS.DOUBLE; break;
        case 3: points = POINTS.TRIPLE; break;
        case 4: points = POINTS.TETRIS; break;
      }
      setScore(prev => prev + points * level);
    }
    
    const newLines = lines + clearedLines;
    const newLevel = calcLevel(newLines);
    setLevel(newLevel);
    
    // 새 조각 생성
    const { piece: newPiece, startPos } = spawnNewPiece();
    
    // 게임 오버 체크
    if (!isValidPosition(clearedBoard, newPiece, startPos)) {
      setGameOver(true);
      setGameStarted(false);
      safePlaySound(SOUND.collapse, 1);
    }
    
    // 고정 효과음 (하드드롭)
    safePlaySound(SOUND.hardDrop, 0.7);
    // 라인 삭제 효과음
    if (clearedLines > 0) safePlaySound(SOUND.collapse, 0.7);
  }, [currentPiece, currentPosition, board, gameOver, isPaused, level, lines, spawnNewPiece]);

  const startGame = () => {
    setBoard(Array(BOARD_HEIGHT).fill(null).map(() => Array(BOARD_WIDTH).fill(0)));
    setScore(0);
    setLevel(1);
    setLines(0);
    setGameOver(false);
    setIsPaused(false);
    setGameStarted(true);

    bagRef.current = [];
    
    const nextPiece = createRandomPiece();
    setNextPiece(nextPiece);
    spawnNewPiece();
  };

  // togglePause useCallback으로 감싸기
  const togglePause = useCallback(() => {
    if (gameOver) return;
    setIsPaused((prev) => !prev);
  }, [gameOver]);

  // 3. 키보드 이벤트 등록 useCallback으로 핸들러 고정
  const handleKeyPress = useCallback((e: KeyboardEvent) => {
    if (!gameStarted) return;
    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        e.preventDefault();
        movePiece(-1, 0, true);
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        e.preventDefault();
        movePiece(1, 0, true);
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        e.preventDefault();
        movePiece(0, 1, true);
        break;
      case 'ArrowUp':
      case 'w':
      case 'W':
        e.preventDefault();
        handleRotate();
        break;
      case ' ':
        e.preventDefault();
        dropPiece();
        break;
      case 'p':
      case 'P':
        e.preventDefault();
        togglePause();
        break;
    }
  }, [gameStarted, movePiece, handleRotate, dropPiece, togglePause]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  // 4. 게임 루프 setTimeout으로 변경
  useEffect(() => {
    if (!gameStarted || gameOver || isPaused) return;
    let timer: NodeJS.Timeout;
    const dropInterval = Math.max(50, 1000 - (level - 1) * 100);
    const loop = () => {
      movePiece(0, 1);
      timer = setTimeout(loop, dropInterval);
    };
    timer = setTimeout(loop, dropInterval);
    return () => clearTimeout(timer);
  }, [movePiece, level, gameStarted, gameOver, isPaused]);

  // 게임 시작시 첫 조각 생성
  useEffect(() => {
    if (gameStarted && !currentPiece) {
      spawnNewPiece();
    }
  }, [gameStarted, currentPiece, spawnNewPiece]);

  // 5. renderBoard useMemo 적용
  const displayBoard = useMemo(() => {
    const tempBoard = board.map(row => [...row]);
    if (currentPiece) {
      for (let y = 0; y < currentPiece.shape.length; y++) {
        for (let x = 0; x < currentPiece.shape[y].length; x++) {
          if (currentPiece.shape[y][x]) {
            const boardY = currentPosition.y + y;
            const boardX = currentPosition.x + x;
            if (boardY >= 0 && boardY < BOARD_HEIGHT && boardX >= 0 && boardX < BOARD_WIDTH) {
              tempBoard[boardY][boardX] = currentPiece.color;
            }
          }
        }
      }
    }
    return tempBoard;
  }, [board, currentPiece, currentPosition]);

  const getCellColor = (cell: BoardCell) => {
    if (!cell) return 'bg-gray-900 border border-gray-700';
    if (typeof cell !== 'string') return 'bg-white';
    // 각 블록 색상에 맞는 border 색상 적용 (조건문으로 명확하게 분기)
    switch (cell) {
      case 'cyan':
        return 'bg-gradient-to-t from-cyan-600 to-cyan-300 border border-cyan-600';
      case 'yellow':
        return 'bg-gradient-to-t from-yellow-400 to-yellow-200 border border-yellow-400';
      case 'purple':
        return 'bg-gradient-to-t from-purple-600 to-purple-300 border border-purple-500';
      case 'green':
        return 'bg-gradient-to-t from-green-600 to-green-300 border border-green-500';
      case 'red':
        return 'bg-gradient-to-t from-red-600 to-red-300 border border-red-500';
      case 'blue':
        return 'bg-gradient-to-t from-blue-600 to-blue-300 border border-blue-500';
      case 'orange':
        return 'bg-gradient-to-t from-orange-500 to-orange-200 border border-orange-400';
      default:
        return 'bg-white';
    }
  };

  const renderPiecePreview = (piece: Tetromino | null, size = 'w-16 h-16') => {
    // 항상 4x4 그리드 유지, piece가 없으면 빈칸만
    if (!piece) {
      return (
        <div className={`bg-gray-700 p-1 rounded flex items-center justify-center ${size}`}>
          <div className="grid grid-rows-4 grid-cols-4 gap-px w-full h-full">
            {[...Array(16)].map((_, i) => (
              <div key={i} className="w-full aspect-square" />
            ))}
          </div>
        </div>
      );
    }

    // bounding box(최소 사각형) 중심 계산
    let minY = 4, maxY = -1, minX = 4, maxX = -1;
    for (let y = 0; y < piece.shape.length; y++) {
      for (let x = 0; x < piece.shape[y].length; x++) {
        if (piece.shape[y][x]) {
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
    }
    const centerY = (minY + maxY) / 2;
    const centerX = (minX + maxX) / 2;
    // 4x4 그리드의 중심(1.5, 1.5)와 shape 중심의 차이 계산
    const deltaX = 1.5 - centerX;
    const deltaY = 1.5 - centerY;

    return (
      <div className={`bg-gray-700 p-1 rounded flex items-center justify-center ${size}`}>
        <div
          className="grid grid-rows-4 grid-cols-4 gap-px w-full h-full"
          style={{
            transform: `translate(${deltaX * 100 / 4}%, ${deltaY * 100 / 4}%)`,
          }}
        >
          {[...Array(4)].map((_, y) => (
            [...Array(4)].map((_, x) => {
              let cell = 0;
              const shapeY = y;
              const shapeX = x;
              if (
                shapeY >= 0 && shapeY < piece.shape.length &&
                shapeX >= 0 && shapeX < (piece.shape[shapeY]?.length ?? 0)
              ) {
                cell = piece.shape[shapeY][shapeX];
              }
              return (
                <div
                  key={`${y}-${x}`}
                  className={`w-full aspect-square ${cell && typeof piece.color === 'string' ? getCellColor(piece.color) : ''}`}
                />
              );
            })
          ))}
        </div>
      </div>
    );
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const event = e as BeforeInstallPromptEvent;
      event.preventDefault();
      setDeferredPrompt(event);
      setShowInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(() => {
        setShowInstall(false);
      });
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 bg-black min-h-screen text-white">
      <h1 className="text-4xl font-extrabold mb-4 text-green-300 whitespace-nowrap">TETRIS</h1>
      
      <div className="flex gap-8 items-center justify-center">
        {/* 게임 보드 */}
        <div className="relative">
          <div
            className="mx-auto aspect-[10/20] max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg min-w-[200px] min-h-[400px] grid gap-0 bg-gray-800 p-0 border-2 border-gray-600 shadow-[0_0_40px_10px_rgba(34,197,94,0.5)] box-border"
            style={{ gridTemplateColumns: `repeat(${BOARD_WIDTH}, 1fr)` }}
          >
            {displayBoard.map((row, y) =>
              row.map((cell, x) => (
                <div
                  key={`${y}-${x}`}
                  className={`w-full aspect-square ${getCellColor(cell)}`}
                />
              ))
            )}
          </div>
          
          {/* 게임 오버 오버레이 */}
          {gameOver && (
            <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-red-400 mb-2">게임 오버!</h2>
                <p className="text-lg mb-2">점수: {score.toLocaleString()}</p>
                <button
                  onClick={startGame}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded font-bold"
                >
                  다시 시작
                </button>
              </div>
            </div>
          )}
          
          {/* 일시정지 오버레이 */}
          {isPaused && gameStarted && !gameOver && (
            <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-yellow-400 mb-2">일시정지</h2>
              </div>
            </div>
          )}
        </div>
        
        {/* 오른쪽 패널 - 게임 정보 */}
        <div className="space-y-4">
          <div className="bg-gray-800 p-1 rounded text-center">
            <h3 className="text-sm font-bold whitespace-nowrap">점수</h3>
            <p className="text-lg font-mono text-cyan-400 whitespace-nowrap">{score.toLocaleString()}</p>
          </div>
          
          <div className="bg-gray-800 p-1 rounded text-center">
            <h3 className="text-sm font-bold whitespace-nowrap">레벨</h3>
            <p className="text-lg font-mono text-yellow-400 whitespace-nowrap">{level}</p>
          </div>
          
          <div className="bg-gray-800 p-1 rounded text-center">
            <h3 className="text-sm font-bold whitespace-nowrap">라인</h3>
            <p className="text-lg font-mono text-green-400 whitespace-nowrap">{lines}</p>
          </div>
          
          {/* NEXT 블록 미리보기 */}
          <div className="bg-gray-800 p-1 rounded text-center">
            <h3 className="text-sm font-bold mb-2 whitespace-nowrap">NEXT</h3>
            <div className="flex justify-center">
              {renderPiecePreview(nextPiece, 'w-16 h-16')}
            </div>
          </div>
          
          <div className="space-y-2">
            {!gameStarted && (
              <button
                onClick={startGame}
                className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-bold whitespace-nowrap"
              >
                게임 시작
              </button>
            )}
            
            {gameStarted && !gameOver && (
              <>
                <button
                  onClick={togglePause}
                  className="w-full px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded font-bold whitespace-nowrap"
                >
                  {isPaused ? '계속하기' : '일시정지'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      
      {/* 모바일 컨트롤 */}
      <div className="mt-8 w-full max-w-sm">
        <div className="grid grid-cols-4 gap-3">
          {/* 왼쪽 이동 */}
          <button
            onTouchStart={() => startContinuousMove(-1)}
            onTouchEnd={stopContinuousMove}
            onClick={() => movePiece(-1, 0, true)}
            className="col-span-1 h-16 bg-gray-600 hover:bg-gray-700 active:bg-gray-800 rounded-lg font-bold text-xl flex items-center justify-center touch-manipulation whitespace-nowrap"
            disabled={!gameStarted || gameOver || isPaused}
          >
            ←
          </button>
          {/* 오른쪽 이동 */}
          <button
            onTouchStart={() => startContinuousMove(1)}
            onTouchEnd={stopContinuousMove}
            onClick={() => movePiece(1, 0, true)}
            className="col-span-1 h-16 bg-gray-600 hover:bg-gray-700 active:bg-gray-800 rounded-lg font-bold text-xl flex items-center justify-center touch-manipulation whitespace-nowrap"
            disabled={!gameStarted || gameOver || isPaused}
          >
            →
          </button>
          {/* 회전 버튼 */}
          <button
            onClick={handleRotate}
            onTouchStart={handleRotate}
            className="col-span-1 h-16 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg font-bold text-sm flex items-center justify-center touch-manipulation whitespace-nowrap"
            disabled={!gameStarted || gameOver || isPaused}
          >
            회전
          </button>
          {/* 하드 드롭 */}
          <button
            onClick={dropPiece}
            className="col-span-1 h-16 bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-lg font-bold text-sm flex items-center justify-center touch-manipulation whitespace-nowrap"
            disabled={!gameStarted || gameOver || isPaused}
          >
            드롭
          </button>
        </div>
      </div>
      
      {/* PWA 설치 안내 버튼 */}
      {showInstall && (
        <button
          onClick={handleInstallClick}
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 1000,
            background: '#06b6d4',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '12px 20px',
            fontSize: 18,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
          }}
        >
          앱 설치하기
        </button>
      )}
      
      {/* tailwind purge 방지용 더미 */}
      <div className="hidden border-cyan-600 border-blue-500 from-cyan-600 to-cyan-300 from-blue-600 to-blue-300"></div>
    </div>
  );
}