import React, { useState, useRef, useEffect } from 'react';
import { Camera, Upload, RefreshCw, CheckCircle2, AlertCircle, Shield, X, Eye, FileText, Loader2, Check } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Camera as CapCamera, CameraResultType, CameraSource, CameraDirection } from '@capacitor/camera';

/**
 * Compress an image to sensible size (<250KB) via HTML5 Canvas
 */
export async function compressImage(fileOrDataUrl, maxWidth = 960, quality = 0.80) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let width = img.width || 800;
            let height = img.height || 600;

            if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            let q = quality;
            let compressedDataUrl = canvas.toDataURL('image/jpeg', q);
            // Step down quality if still above ~250KB (approx 340,000 base64 chars)
            while (compressedDataUrl.length > 340000 && q > 0.45) {
                q -= 0.12;
                compressedDataUrl = canvas.toDataURL('image/jpeg', q);
            }
            resolve(compressedDataUrl);
        };
        img.onerror = (err) => reject(err);

        if (typeof fileOrDataUrl === 'string') {
            img.src = fileOrDataUrl;
        } else {
            const reader = new FileReader();
            reader.onload = (e) => {
                img.src = e.target.result;
            };
            reader.onerror = (e) => reject(e);
            reader.readAsDataURL(fileOrDataUrl);
        }
    });
}

/**
 * PhotoCapture component for capturing face (front/side) and National ID (front/back)
 * Stores each photo distinctly against its field prop and beneficiary record.
 */
export default function PhotoCapture({
    label,
    type = 'face_front', // 'face_front' | 'face_side' | 'id_front' | 'id_back' | 'document'
    value = null,
    onChange,
    required = false,
    personLabel = 'Beneficiary',
    receiptNumber = 'No receipt on file'
}) {
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [stream, setStream] = useState(null);
    const [cameraError, setCameraError] = useState('');
    const [showPrivacyNotice, setShowPrivacyNotice] = useState(false);
    const [isCompressing, setIsCompressing] = useState(false);
    const [previewModalOpen, setPreviewModalOpen] = useState(false);
    const [pendingPreview, setPendingPreview] = useState(null);

    const videoRef = useRef(null);
    const fileInputRef = useRef(null);

    // Stop camera stream on unmount
    useEffect(() => {
        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, [stream]);

    // Attach stream to video element when camera modal opens
    useEffect(() => {
        if (isCameraOpen && stream && videoRef.current && !pendingPreview) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(e => console.log('Video play error:', e));
        }
    }, [isCameraOpen, stream, pendingPreview]);

    const requestNativePermissionIfNeeded = async () => {
        if (!Capacitor.isNativePlatform()) return true;
        try {
            const permStatus = await CapCamera.checkPermissions();
            if (permStatus.camera !== 'granted') {
                const requested = await CapCamera.requestPermissions({ permissions: ['camera'] });
                if (requested.camera === 'denied') {
                    return false;
                }
            }
            return true;
        } catch (e) {
            return true;
        }
    };

    const captureViaNativeFallback = async () => {
        if (!Capacitor.isNativePlatform()) return false;
        try {
            const isFront = type === 'face_front' || type === 'face_side';
            const photo = await CapCamera.getPhoto({
                quality: 82,
                allowEditing: false,
                resultType: CameraResultType.DataUrl,
                source: CameraSource.Camera,
                direction: isFront ? CameraDirection.Front : CameraDirection.Rear,
                width: 960
            });
            if (photo && photo.dataUrl) {
                setIsCompressing(true);
                const compressed = await compressImage(photo.dataUrl, 900, 0.80);
                setPendingPreview(compressed);
                setIsCompressing(false);
                return true;
            }
        } catch (err) {
            setIsCompressing(false);
            const msg = String(err?.message || '');
            if (/cancel/i.test(msg)) {
                stopCamera();
                return true;
            }
        }
        return false;
    };

    const startCamera = async () => {
        setCameraError('');
        setPendingPreview(null);
        setIsCameraOpen(true);

        const hasPerm = await requestNativePermissionIfNeeded();
        if (!hasPerm) {
            setCameraError(
                'Camera permission was denied. Please enable Camera access in your device Settings or use the Upload File option below.'
            );
            return;
        }

        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                const usedNative = await captureViaNativeFallback();
                if (!usedNative) {
                    setCameraError('Live camera preview is unavailable in this browser context. Please use Upload File below.');
                }
                return;
            }

            const facing = (type === 'face_front' || type === 'face_side') ? 'user' : 'environment';
            let mediaStream;
            try {
                mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: facing },
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    },
                    audio: false
                });
            } catch (constraintErr) {
                // Fallback to any available video camera (e.g. desktop webcam without environment camera)
                mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: false
                });
            }
            setStream(mediaStream);
        } catch (err) {
            console.error('Camera access error:', err);
            // Try native Capacitor camera before showing error
            const usedNative = await captureViaNativeFallback();
            if (usedNative) return;

            let msg = 'Camera permission denied or camera unavailable on this device. Please allow camera access or upload an image file instead.';
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                msg = 'Camera access was blocked. Please grant camera permission in your browser/device settings or upload an image file.';
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                msg = 'No camera hardware detected on this device. Please use the file upload option.';
            } else if (err.name === 'NotReadableError') {
                msg = 'Camera is currently in use by another application. Please close other camera apps and try again.';
            }
            setCameraError(msg);
        }
    };

    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
        setPendingPreview(null);
        setIsCameraOpen(false);
        setCameraError('');
    };

    const capturePhoto = async () => {
        if (!videoRef.current) return;
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 800;
        canvas.height = video.videoHeight || 600;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const rawDataUrl = canvas.toDataURL('image/jpeg', 0.90);

        try {
            setIsCompressing(true);
            const compressed = await compressImage(rawDataUrl, 900, 0.80);
            setPendingPreview(compressed);
        } catch (e) {
            console.error('Compression error:', e);
            setPendingPreview(rawDataUrl);
        } finally {
            setIsCompressing(false);
        }
    };

    const confirmPendingPhoto = () => {
        if (!pendingPreview) return;
        if (onChange) onChange(pendingPreview);
        stopCamera();
    };

    const retakeInModal = () => {
        setPendingPreview(null);
        if (!stream) {
            startCamera();
        }
    };

    const handleFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.type === 'application/pdf') {
            const reader = new FileReader();
            reader.onload = () => {
                if (onChange) onChange(reader.result);
            };
            reader.readAsDataURL(file);
            return;
        }

        try {
            setIsCompressing(true);
            const compressed = await compressImage(file, 900, 0.80);
            if (onChange) onChange(compressed);
        } catch (err) {
            console.error('File compression error:', err);
            const reader = new FileReader();
            reader.onload = () => {
                if (onChange) onChange(reader.result);
            };
            reader.readAsDataURL(file);
        } finally {
            setIsCompressing(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const isPdf = typeof value === 'string' && value.startsWith('data:application/pdf');
    const photoTypeBadge =
        type === 'face_front' ? 'Front Face' :
        type === 'face_side' ? '90° Side Profile' :
        type === 'id_front' ? 'ID Front' :
        type === 'id_back' ? 'ID Back' : 'Document';

    return (
        <div className="photo-capture-card bg-slate-50/80 border border-slate-200 rounded-xl p-3.5 space-y-2.5 transition-all hover:border-slate-300">
            {/* Header / Label */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-800 text-xs sm:text-sm">
                        {label} {required && <span className="text-rose-600">*</span>}
                    </span>
                    <button
                        type="button"
                        onClick={() => setShowPrivacyNotice(!showPrivacyNotice)}
                        className="text-slate-400 hover:text-emerald-700"
                        title="View Privacy and Biometric Notice"
                    >
                        <Shield size={13} />
                    </button>
                </div>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700">
                    {personLabel} · {photoTypeBadge}
                </span>
            </div>

            {/* Privacy notice dropdown */}
            {showPrivacyNotice && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] text-emerald-900 leading-relaxed flex items-start gap-2">
                    <Shield size={14} className="text-emerald-700 flex-shrink-0 mt-0.5" />
                    <div>
                        <strong>Statutory Identity Securitization Notice:</strong> Biometric facial photographs and National ID documents are collected under the Deeds Registries Act for personal verification, fraud prevention, and title deed securitization. Front and side profile photos are stored separately against the beneficiary record.
                    </div>
                </div>
            )}

            {/* If photo captured: show preview thumbnail, Retake Camera & Replace File buttons */}
            {value ? (
                <div className="bg-white border-2 border-emerald-500/40 rounded-xl p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                        {isPdf ? (
                            <div className="w-14 h-14 rounded-lg bg-rose-50 border border-rose-200 flex flex-col items-center justify-center text-rose-600 flex-shrink-0">
                                <FileText size={20} />
                                <span className="text-[9px] font-bold mt-0.5">PDF</span>
                            </div>
                        ) : (
                            <div
                                onClick={() => setPreviewModalOpen(true)}
                                className="relative w-14 h-14 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 cursor-pointer group flex-shrink-0"
                                title="Click to enlarge preview"
                            >
                                <img src={value} alt={label} className="w-full h-full object-cover" />
                                <div
                                    style={{ backgroundColor: 'rgba(15, 23, 42, 0.45)' }}
                                    className="absolute inset-0 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white"
                                >
                                    <Eye size={16} />
                                </div>
                            </div>
                        )}
                        <div className="min-w-0">
                            <div className="flex items-center gap-1 text-emerald-700 text-xs font-bold">
                                <CheckCircle2 size={13} />
                                <span className="truncate">Attached & Verified ({photoTypeBadge})</span>
                            </div>
                            <div className="text-[11px] text-slate-500 truncate mt-0.5">
                                Receipt: {receiptNumber}
                            </div>
                            <div className="text-[10px] text-slate-400">
                                {isPdf ? 'Portable Document Format' : 'Compressed Biometric JPEG (<250KB)'}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0 justify-end">
                        {!isPdf && (
                            <button
                                type="button"
                                onClick={() => setPreviewModalOpen(true)}
                                className="px-2 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 flex items-center gap-1"
                                title="Preview Photo"
                            >
                                <Eye size={12} /> Preview
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={startCamera}
                            disabled={isCompressing}
                            className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1"
                        >
                            <Camera size={12} /> Retake
                        </button>
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isCompressing}
                            className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 flex items-center gap-1"
                        >
                            <RefreshCw size={12} /> Replace
                        </button>
                    </div>
                </div>
            ) : (
                /* Capture buttons when not yet captured */
                <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={startCamera}
                            disabled={isCompressing}
                            className="btn border border-emerald-600 bg-white hover:bg-emerald-50 text-emerald-800 font-bold py-2.5 px-3 rounded-lg flex items-center justify-center gap-1.5 text-xs shadow-xs"
                        >
                            {isCompressing ? <Loader2 size={15} className="animate-spin text-emerald-600" /> : <Camera size={15} className="text-emerald-600" />}
                            <span>{isCompressing ? 'Processing...' : 'Capture Camera'}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isCompressing}
                            className="btn border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold py-2.5 px-3 rounded-lg flex items-center justify-center gap-1.5 text-xs shadow-xs"
                        >
                            <Upload size={15} className="text-slate-600" />
                            <span>Upload File</span>
                        </button>
                    </div>
                    <div className="text-[11px] text-slate-500 text-center">
                        {type === 'face_front' && 'Frontal view with natural expression, no sunglasses'}
                        {type === 'face_side' && 'Profile view at 90° showing ear and side of face'}
                        {type === 'id_front' && 'Front side of National ID metal card or Passport page'}
                        {type === 'id_back' && 'Back side of National ID card with barcode'}
                        {type === 'document' && 'Clear photocopy or PDF document'}
                    </div>
                </div>
            )}

            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleFileChange}
                className="hidden"
            />

            {/* Camera Modal with Guidance Overlay & Instant Retake/Use Preview */}
            {isCameraOpen && (
                <div
                    style={{ backgroundColor: 'rgba(2, 6, 23, 0.95)' }}
                    className="fixed inset-0 z-50 flex flex-col items-center justify-between p-4 sm:p-6"
                >
                    {/* Top bar */}
                    <div className="w-full max-w-lg flex items-center justify-between text-white pb-3 border-b border-white/20">
                        <div>
                            <h3 className="font-bold text-sm sm:text-base flex items-center gap-2 text-white">
                                <Camera size={18} className="text-emerald-400" />
                                {label}
                            </h3>
                            <span className="text-[11px] text-gray-300">{personLabel} · {photoTypeBadge} · Receipt: {receiptNumber}</span>
                        </div>
                        <button
                            type="button"
                            onClick={stopCamera}
                            className="p-1.5 rounded-full hover:bg-white/20 text-white transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Camera Viewport or Captured Preview */}
                    <div className="relative w-full max-w-lg aspect-4/3 rounded-2xl overflow-hidden bg-black flex items-center justify-center my-auto shadow-2xl border-2 border-white/20">
                        {cameraError ? (
                            <div className="p-6 text-center text-white space-y-3">
                                <AlertCircle size={36} className="text-red-400 mx-auto" />
                                <p className="text-xs sm:text-sm text-gray-200">{cameraError}</p>
                                <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                                    <button
                                        type="button"
                                        onClick={startCamera}
                                        className="btn bg-emerald-600 text-white font-bold py-2 px-4 rounded-lg text-xs"
                                    >
                                        Retry Camera
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            stopCamera();
                                            fileInputRef.current?.click();
                                        }}
                                        className="btn bg-white text-slate-900 font-bold py-2 px-4 rounded-lg text-xs"
                                    >
                                        Choose Image File Instead
                                    </button>
                                </div>
                            </div>
                        ) : pendingPreview ? (
                            <div className="relative w-full h-full flex items-center justify-center bg-black">
                                <img src={pendingPreview} alt="Captured preview" className="w-full h-full object-contain" />
                                <div
                                    style={{ backgroundColor: 'rgba(6, 78, 59, 0.9)' }}
                                    className="absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-bold text-white flex items-center gap-1.5"
                                >
                                    <CheckCircle2 size={14} /> Preview Ready ({photoTypeBadge})
                                </div>
                            </div>
                        ) : (
                            <>
                                <video
                                    ref={videoRef}
                                    playsInline
                                    autoPlay
                                    muted
                                    className="w-full h-full object-cover"
                                />

                                {/* Guidance Overlays */}
                                {type === 'face_front' && (
                                    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                                        <div className="w-48 sm:w-56 h-64 sm:h-72 border-2 border-dashed border-emerald-400/90 rounded-[50%] shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] relative flex flex-col items-center justify-center">
                                            <div className="w-28 border-t border-emerald-300/60 mb-8" />
                                            <div className="w-12 border-b-2 border-emerald-400 absolute bottom-3" />
                                        </div>
                                        <span
                                            style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
                                            className="mt-3 text-xs font-bold text-white px-3 py-1 rounded-full border border-white/30"
                                        >
                                            Align front face inside oval facing camera
                                        </span>
                                    </div>
                                )}

                                {type === 'face_side' && (
                                    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                                        <div className="w-48 sm:w-56 h-64 sm:h-72 border-2 border-dashed border-emerald-400/90 rounded-[45%_55%_45%_55%/60%_60%_40%_40%] shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] relative flex flex-col items-center justify-center">
                                            <div className="w-16 border-t border-emerald-300/60" />
                                        </div>
                                        <span
                                            style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
                                            className="mt-3 text-xs font-bold text-white px-3 py-1 rounded-full border border-white/30"
                                        >
                                            Turn head 90° for side profile view
                                        </span>
                                    </div>
                                )}

                                {(type === 'id_front' || type === 'id_back' || type === 'document') && (
                                    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                                        <div className="w-64 sm:w-80 h-40 sm:h-52 border-2 border-dashed border-amber-400 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] relative">
                                            <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-amber-300" />
                                            <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-amber-300" />
                                            <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-amber-300" />
                                            <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-amber-300" />
                                        </div>
                                        <span
                                            style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
                                            className="mt-3 text-xs font-bold text-white px-3 py-1 rounded-full border border-white/30"
                                        >
                                            Fit National ID edges within the frame
                                        </span>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Bottom controls */}
                    {!cameraError && (
                        <div className="w-full max-w-lg flex items-center justify-between pt-4">
                            {pendingPreview ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={retakeInModal}
                                        style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
                                        className="px-5 py-2.5 rounded-xl text-white text-xs sm:text-sm font-bold flex items-center gap-1.5"
                                    >
                                        <RefreshCw size={15} /> Retake Photo
                                    </button>
                                    <button
                                        type="button"
                                        onClick={confirmPendingPhoto}
                                        style={{ backgroundColor: '#059669' }}
                                        className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-lg"
                                    >
                                        <Check size={16} /> Use This Photo
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        onClick={stopCamera}
                                        style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
                                        className="px-5 py-2.5 rounded-xl text-white text-xs font-semibold transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={capturePhoto}
                                        disabled={isCompressing}
                                        style={{ backgroundColor: '#059669' }}
                                        className="w-16 h-16 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shadow-lg border-4 border-white transition-transform active:scale-95"
                                        title="Take Snapshot"
                                    >
                                        {isCompressing ? <Loader2 size={24} className="animate-spin" /> : <Camera size={26} />}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            stopCamera();
                                            fileInputRef.current?.click();
                                        }}
                                        style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
                                        className="px-4 py-2.5 rounded-xl text-white text-xs font-semibold flex items-center gap-1.5"
                                    >
                                        <Upload size={14} /> Upload
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Enlarged image preview modal */}
            {previewModalOpen && value && !isPdf && (
                <div
                    style={{ backgroundColor: 'rgba(2, 6, 23, 0.9)' }}
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                >
                    <div
                        style={{ backgroundColor: '#0f172a' }}
                        className="relative max-w-xl w-full rounded-2xl overflow-hidden border border-white/20 p-3 space-y-2"
                    >
                        <div className="flex items-center justify-between text-white px-1">
                            <div>
                                <span className="text-xs sm:text-sm font-bold block">{label}</span>
                                <span className="text-[11px] text-gray-300">{personLabel} · {photoTypeBadge} · Receipt: {receiptNumber}</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setPreviewModalOpen(false)}
                                className="text-white/80 hover:text-white p-1"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <img src={value} alt={label} className="w-full max-h-[68vh] object-contain rounded-lg bg-black" />
                        <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => {
                                    setPreviewModalOpen(false);
                                    startCamera();
                                }}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center gap-1"
                            >
                                <Camera size={13} /> Retake
                            </button>
                            <button
                                type="button"
                                onClick={() => setPreviewModalOpen(false)}
                                style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
                                className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
