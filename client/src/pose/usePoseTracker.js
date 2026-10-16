import { DrawingUtils, FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import { useCallback, useEffect, useRef, useState } from 'react'
import { computeJointAngles, missingKeyLandmarks } from './angles.js'

const WASM_PATH = '/mediapipe/wasm'
const MODEL_PATH = '/models/pose_landmarker_lite.task'
const READOUT_INTERVAL_MS = 100 // throttle React updates to ~10 Hz

async function createLandmarker() {
  const fileset = await FilesetResolver.forVisionTasks(WASM_PATH)
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: MODEL_PATH, delegate },
    runningMode: 'VIDEO',
    numPoses: 1,
  })
  try {
    return await PoseLandmarker.createFromOptions(fileset, options('GPU'))
  } catch (err) {
    console.warn('[pose] GPU delegate failed, using CPU', err)
    return PoseLandmarker.createFromOptions(fileset, options('CPU'))
  }
}

/**
 * Runs MediaPipe Pose Landmarker on the webcam, entirely in the browser.
 * Attach `videoRef` to a <video> and `canvasRef` to an overlay <canvas>.
 * `onFrame(landmarks, angles, { width, height })` is called every processed frame.
 */
export default function usePoseTracker({ onFrame } = {}) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const landmarkerRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(0)
  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame

  const [status, setStatus] = useState('idle') // idle | loading | running | error
  const [error, setError] = useState(null)
  const [angles, setAngles] = useState({})
  const [missing, setMissing] = useState([])
  const [fps, setFps] = useState(0)

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    const canvas = canvasRef.current
    canvas?.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    setStatus('idle')
    setAngles({})
    setMissing([])
  }, [])

  const start = useCallback(async () => {
    setError(null)
    setStatus('loading')
    try {
      if (!landmarkerRef.current) landmarkerRef.current = await createLandmarker()
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      const video = videoRef.current
      video.srcObject = stream
      await video.play()
      setStatus('running')
      loop()
    } catch (err) {
      console.error('[pose]', err)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      setError(
        err.name === 'NotAllowedError'
          ? 'Camera permission was denied. Please allow camera access and try again.'
          : err.name === 'NotFoundError'
            ? 'No camera found on this device.'
            : `Could not start pose tracking: ${err.message}`,
      )
      setStatus('error')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function loop() {
    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const drawer = new DrawingUtils(ctx)
    let lastVideoTime = -1
    let lastReadout = 0
    let frames = 0
    let fpsWindowStart = performance.now()

    const tick = () => {
      if (!streamRef.current) return
      rafRef.current = requestAnimationFrame(tick)
      if (video.readyState < 2 || video.currentTime === lastVideoTime) return
      lastVideoTime = video.currentTime

      const { videoWidth: w, videoHeight: h } = video
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }

      const now = performance.now()
      const result = landmarkerRef.current.detectForVideo(video, now)
      const landmarks = result.landmarks?.[0]

      ctx.clearRect(0, 0, w, h)
      if (landmarks) {
        drawer.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
          color: '#34d399',
          lineWidth: 5,
        })
        drawer.drawLandmarks(landmarks, {
          color: '#ffffff',
          fillColor: '#059669',
          lineWidth: 2,
          radius: 5,
          visibilityMin: 0.5,
        })
      }

      const jointAngles = computeJointAngles(landmarks, w, h)
      onFrameRef.current?.(landmarks ?? null, jointAngles, { width: w, height: h })

      frames++
      if (now - fpsWindowStart >= 1000) {
        setFps(Math.round((frames * 1000) / (now - fpsWindowStart)))
        frames = 0
        fpsWindowStart = now
      }
      if (now - lastReadout >= READOUT_INTERVAL_MS) {
        lastReadout = now
        setAngles(jointAngles)
        setMissing(missingKeyLandmarks(landmarks))
      }
    }
    tick()
  }

  // Release camera and model on unmount
  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      landmarkerRef.current?.close()
      landmarkerRef.current = null
    },
    [],
  )

  return { videoRef, canvasRef, status, error, angles, missing, fps, start, stop }
}
