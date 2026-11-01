import React, { useRef, useState, useEffect, useCallback } from 'react';
import { RotateCcw, Undo2, Check, PenTool, Maximize2, X, CheckCircle2, Lock, AlertCircle } from 'lucide-react';

export default function SignaturePad({
    label = "Digital Signature",
    onSave,
    existingSignature = null,
    readOnly = false,
    date = null,
    required = false,
    personName = ''
}) {
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [hasDrawnInModal, setHasDrawnInModal] = useState(false);
    const [strokeCount, setStrokeCount] = useState(0);
    const [isDrawing, setIsDrawing] = useState(false);
    const [validationError, setValidationError] = useState('');

    const canvasRef = useRef(null);
    const strokesRef = useRef([]); // Array of strokes; each stroke is array of { nx, ny } normalized [0..1]
    const currentStrokeRef = useRef([]);
    const baseImageRef = useRef(null); // Holds loaded Image if editing existingSignature before clear

    const currentDate = date || new Date().toISOString().split('T')[0];

    const redrawCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);

        const ctx = canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);

        // Fill clean white background for printouts and saved files
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, rect.width, rect.height);

        // Draw base existing signature if still retained
        if (baseImageRef.current) {
            const img = baseImageRef.current;
            const hRatio = rect.width / (img.width || rect.width);
            const vRatio = rect.height / (img.height || rect.height);
            const ratio = Math.min(hRatio, vRatio, 1);
            const centerShiftX = (rect.width - img.width * ratio) / 2;
            const centerShiftY = (rect.height - img.height * ratio) / 2;
            ctx.drawImage(
                img,
                0,
                0,
                img.width,
                img.height,
                centerShiftX,
                centerShiftY,
                img.width * ratio,
                img.height * ratio
            );
        }

        ctx.strokeStyle = '#064e3b';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const drawStrokePoints = (pts) => {
            if (!pts || pts.length === 0) return;
            ctx.beginPath();
            const firstX = pts[0].nx * rect.width;
            const firstY = pts[0].ny * rect.height;
            ctx.moveTo(firstX, firstY);

            if (pts.length === 1) {
                ctx.lineTo(firstX + 0.5, firstY + 0.5);
            } else {
                for (let i = 1; i < pts.length; i++) {
                    const prevX = pts[i - 1].nx * rect.width;
                    const prevY = pts[i - 1].ny * rect.height;
                    const currX = pts[i].nx * rect.width;
                    const currY = pts[i].ny * rect.height;
                    const midX = (prevX + currX) / 2;
                    const midY = (prevY + currY) / 2;
                    ctx.quadraticCurveTo(prevX, prevY, midX, midY);
                }
                const last = pts[pts.length - 1];
                ctx.lineTo(last.nx * rect.width, last.ny * rect.height);
            }
            ctx.stroke();
        };

        for (const stroke of strokesRef.current) {
            drawStrokePoints(stroke);
        }
        if (currentStrokeRef.current.length > 0) {
            drawStrokePoints(currentStrokeRef.current);
        }
    }, []);

    // Lock page scroll and gestures when full-screen signing pad is open
    useEffect(() => {
        if (isFullScreen) {
            const originalOverflow = document.body.style.overflow;
            const originalTouchAction = document.body.style.touchAction;

            document.body.style.overflow = 'hidden';
            document.body.style.touchAction = 'none';

            const preventTouchMove = (e) => {
                if (e.target.tagName !== 'CANVAS') {
                    e.preventDefault();
                }
            };
            document.addEventListener('touchmove', preventTouchMove, { passive: false });

            return () => {
                document.body.style.overflow = originalOverflow;
                document.body.style.touchAction = originalTouchAction;
                document.removeEventListener('touchmove', preventTouchMove);
            };
        }
    }, [isFullScreen]);

    // Setup canvas when full screen opens and handle rotation/resize smoothly
    useEffect(() => {
        if (!isFullScreen) return;
        setValidationError('');
        strokesRef.current = [];
        currentStrokeRef.current = [];
        setStrokeCount(0);
        baseImageRef.current = null;

        const timer = setTimeout(() => {
            if (existingSignature) {
                const img = new Image();
                img.onload = () => {
                    baseImageRef.current = img;
                    setHasDrawnInModal(true);
                    redrawCanvas();
                };
                img.onerror = () => {
                    setHasDrawnInModal(false);
                    redrawCanvas();
                };
                img.src = existingSignature;
            } else {
                setHasDrawnInModal(false);
                redrawCanvas();
            }
        }, 60);

        const handleResizeOrRotate = () => {
            requestAnimationFrame(() => redrawCanvas());
        };

        window.addEventListener('resize', handleResizeOrRotate);
        window.addEventListener('orientationchange', handleResizeOrRotate);

        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', handleResizeOrRotate);
            window.removeEventListener('orientationchange', handleResizeOrRotate);
        };
    }, [isFullScreen, existingSignature, redrawCanvas]);

    const getNormalizedPoint = (e) => {
        const canvas = canvasRef.current;
        if (!canvas) return { nx: 0, ny: 0, x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        let clientX = e.clientX;
        let clientY = e.clientY;
        if (e.touches && e.touches[0]) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else if (e.changedTouches && e.changedTouches[0]) {
            clientX = e.changedTouches[0].clientX;
            clientY = e.changedTouches[0].clientY;
        }
        const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
        const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
        return {
            x,
            y,
            nx: rect.width > 0 ? x / rect.width : 0,
            ny: rect.height > 0 ? y / rect.height : 0
        };
    };

    const startDrawing = (e) => {
        if (e.cancelable) e.preventDefault();
        setValidationError('');
        const pt = getNormalizedPoint(e);
        currentStrokeRef.current = [{ nx: pt.nx, ny: pt.ny }];
        setIsDrawing(true);

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = '#064e3b';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
    };

    const draw = (e) => {
        if (!isDrawing) return;
        if (e.cancelable) e.preventDefault();
        const canvas = canvasRef.current;
        if (!canvas) return;
        const pt = getNormalizedPoint(e);
        const pts = currentStrokeRef.current;
        pts.push({ nx: pt.nx, ny: pt.ny });

        const ctx = canvas.getContext('2d');
        if (pts.length >= 2) {
            const rect = canvas.getBoundingClientRect();
            const prev = pts[pts.length - 2];
            const prevX = prev.nx * rect.width;
            const prevY = prev.ny * rect.height;
            const midX = (prevX + pt.x) / 2;
            const midY = (prevY + pt.y) / 2;
            ctx.quadraticCurveTo(prevX, prevY, midX, midY);
            ctx.stroke();
        } else {
            ctx.lineTo(pt.x, pt.y);
            ctx.stroke();
        }
        setHasDrawnInModal(true);
    };

    const stopDrawing = (e) => {
        if (!isDrawing) return;
        if (e && e.cancelable) e.preventDefault();
        setIsDrawing(false);
        if (currentStrokeRef.current.length > 0) {
            strokesRef.current = [...strokesRef.current, [...currentStrokeRef.current]];
            currentStrokeRef.current = [];
            setStrokeCount(strokesRef.current.length);
            setHasDrawnInModal(true);
            redrawCanvas();
        }
    };

    const handleUndo = (e) => {
        if (e) e.preventDefault();
        setValidationError('');
        if (strokesRef.current.length > 0) {
            strokesRef.current = strokesRef.current.slice(0, -1);
            setStrokeCount(strokesRef.current.length);
            const stillHasSignature = strokesRef.current.length > 0 || Boolean(baseImageRef.current);
            setHasDrawnInModal(stillHasSignature);
            redrawCanvas();
        } else if (baseImageRef.current) {
            baseImageRef.current = null;
            setHasDrawnInModal(false);
            redrawCanvas();
        }
    };

    const handleClear = (e) => {
        if (e) e.preventDefault();
        setValidationError('');
        strokesRef.current = [];
        currentStrokeRef.current = [];
        baseImageRef.current = null;
        setStrokeCount(0);
        setHasDrawnInModal(false);
        redrawCanvas();
    };

    const handleCancel = (e) => {
        if (e) e.preventDefault();
        setValidationError('');
        setIsFullScreen(false);
        setHasDrawnInModal(false);
    };

    const handleSave = (e) => {
        if (e) e.preventDefault();
        const totalPoints = strokesRef.current.reduce((sum, s) => sum + s.length, 0);
        if (!hasDrawnInModal || (!baseImageRef.current && totalPoints < 5)) {
            setValidationError('Please draw a complete signature before saving (empty or single-dot taps are not accepted).');
            return;
        }
        const canvas = canvasRef.current;
        if (!canvas) return;
        redrawCanvas();
        const dataUrl = canvas.toDataURL('image/png');
        if (onSave) onSave(dataUrl);
        setValidationError('');
        setIsFullScreen(false);
    };

    return (
        <div className="signature-pad-wrapper bg-slate-50/90 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
            {/* Header info */}
            <div className="flex items-center justify-between">
                <div>
                    <label className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1.5">
                        <PenTool size={15} className="text-emerald-700" />
                        <span>{label}</span> {required && <span className="text-rose-600">*</span>}
                    </label>
                    {personName && <div className="text-[11px] text-slate-500 font-medium">{personName}</div>}
                </div>
                <div className="text-right">
                    <span className="text-xs font-semibold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                        Date: <strong className="text-slate-900">{currentDate}</strong>
                    </span>
                </div>
            </div>

            {/* Thumbnail Display or Tap-to-Sign Box */}
            {existingSignature ? (
                <div className="bg-white border-2 border-emerald-500/50 rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="relative w-36 sm:w-44 h-16 bg-white rounded-lg border border-slate-200 p-1 flex items-center justify-center overflow-hidden">
                            <img
                                src={existingSignature}
                                alt={`${label} Preview`}
                                className="max-w-full max-h-full object-contain"
                            />
                        </div>
                        <div>
                            <div className="flex items-center gap-1 text-xs font-bold text-emerald-800">
                                <CheckCircle2 size={14} className="text-emerald-600" />
                                <span>Signature Confirmed</span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                                Date: {currentDate}
                            </div>
                            <div className="text-[10px] text-slate-400">
                                Statutory electronic affidavit (Print-ready)
                            </div>
                        </div>
                    </div>

                    {!readOnly && (
                        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                            <button
                                type="button"
                                onClick={() => setIsFullScreen(true)}
                                className="btn border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold py-1.5 px-3 rounded-lg text-xs flex items-center gap-1"
                            >
                                <RotateCcw size={13} /> Re-sign
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                /* Unsigned Box */
                <button
                    type="button"
                    onClick={() => !readOnly && setIsFullScreen(true)}
                    disabled={readOnly}
                    className="w-full h-24 border-2 border-dashed border-emerald-400 hover:border-emerald-600 bg-white hover:bg-emerald-50/50 rounded-xl flex flex-col items-center justify-center gap-1 text-slate-600 hover:text-emerald-800 transition-all cursor-pointer group p-2 shadow-xs"
                >
                    <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-emerald-800 group-hover:scale-105 transition-transform">
                        <Maximize2 size={16} className="text-emerald-600" />
                        <span>Tap to Sign in Full-Screen</span>
                    </div>
                    <span className="text-[11px] text-slate-500">
                        Full-screen pad with Clear, Undo & Save (Supports touch, stylus, mouse & rotation)
                    </span>
                </button>
            )}

            {/* FULL-SCREEN LANDSCAPE SIGNATURE PAD MODAL */}
            {isFullScreen && (
                <div
                    style={{ backgroundColor: '#020617' }}
                    className="fixed inset-0 z-50 flex flex-col justify-between p-3 sm:p-5 select-none touch-none"
                >
                    {/* Top Header */}
                    <div className="flex items-center justify-between text-white pb-3 border-b border-white/20">
                        <div className="flex items-center gap-2">
                            <PenTool size={18} className="text-emerald-400" />
                            <div>
                                <h2 className="text-sm sm:text-base font-bold leading-tight text-white">
                                    {label} {personName ? `— ${personName}` : ''}
                                </h2>
                                <div className="text-[11px] text-gray-300 flex items-center gap-2 mt-0.5">
                                    <span>Date: {currentDate}</span>
                                    <span>•</span>
                                    <span className="inline-flex items-center gap-1 text-emerald-300">
                                        <Lock size={10} /> Rotation-Safe Vector Pad
                                    </span>
                                </div>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={handleCancel}
                            className="p-1.5 rounded-full hover:bg-white/20 text-white transition-colors"
                            title="Cancel"
                        >
                            <X size={22} />
                        </button>
                    </div>

                    {validationError && (
                        <div className="mt-2 p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold flex items-center gap-2">
                            <AlertCircle size={15} className="text-red-600 shrink-0" />
                            <span>{validationError}</span>
                        </div>
                    )}

                    {/* Canvas Area: Large landscape area for long signatures */}
                    <div className="relative flex-1 w-full my-3 bg-white rounded-2xl overflow-hidden border-2 border-emerald-500 shadow-2xl flex flex-col">
                        <canvas
                            ref={canvasRef}
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseLeave={stopDrawing}
                            onTouchStart={startDrawing}
                            onTouchMove={draw}
                            onTouchEnd={stopDrawing}
                            className="w-full flex-1 block touch-none cursor-crosshair bg-white"
                        />

                        {/* Baseline and statutory guidance */}
                        <div className="absolute inset-x-8 bottom-10 pointer-events-none border-b-2 border-dashed border-slate-300 flex items-center justify-between text-[11px] text-slate-400 pb-1">
                            <span>Sign above this statutory line ({personName || label})</span>
                            <span>Deeds Registries Act Official Pad · {currentDate}</span>
                        </div>

                        {!hasDrawnInModal && (
                            <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-slate-400 text-sm font-semibold px-4 text-center">
                                ✍️ Use your finger, stylus, or mouse to sign here
                            </div>
                        )}
                    </div>

                    {/* Bottom Action Bar: Clear, Undo, Cancel, Save Signature */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={handleClear}
                                style={{ backgroundColor: 'rgba(255,255,255,0.14)' }}
                                className="px-3.5 py-2.5 rounded-xl text-white font-semibold text-xs sm:text-sm flex items-center gap-1.5 transition-colors"
                            >
                                <RotateCcw size={15} /> Clear
                            </button>
                            <button
                                type="button"
                                onClick={handleUndo}
                                disabled={strokeCount === 0 && !baseImageRef.current}
                                style={{
                                    backgroundColor: (strokeCount > 0 || baseImageRef.current)
                                        ? 'rgba(255,255,255,0.18)'
                                        : 'rgba(255,255,255,0.06)'
                                }}
                                className={`px-3.5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm flex items-center gap-1.5 transition-colors ${
                                    strokeCount > 0 || baseImageRef.current
                                        ? 'text-white cursor-pointer'
                                        : 'text-gray-500 cursor-not-allowed'
                                }`}
                            >
                                <Undo2 size={15} /> Undo
                            </button>
                            <button
                                type="button"
                                onClick={handleCancel}
                                style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}
                                className="px-3.5 py-2.5 rounded-xl text-white font-semibold text-xs sm:text-sm transition-colors"
                            >
                                Cancel
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={handleSave}
                            style={{
                                backgroundColor: hasDrawnInModal ? '#059669' : 'rgba(255,255,255,0.15)'
                            }}
                            className={`px-6 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg transition-all text-white ${
                                hasDrawnInModal
                                    ? 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer active:scale-95'
                                    : 'opacity-60 cursor-pointer'
                            }`}
                        >
                            <Check size={16} />
                            <span>Save Signature</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
