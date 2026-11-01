import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Network } from '@capacitor/network'

/**
 * Mobile Service for Hardware Features
 * Handles Native Android Sensors (GPS, Camera) and Web Fallbacks
 */
export const mobileService = {
  isNative: () => Capacitor.isNativePlatform(),

  /**
   * Acquire current GPS location with high accuracy
   * Returns: { latitude, longitude, accuracy }
   */
  async getCurrentLocation() {
    try {
      if (Capacitor.isNativePlatform()) {
        const permission = await Geolocation.checkPermissions()
        if (permission.location !== 'granted') {
          const requested = await Geolocation.requestPermissions()
          if (requested.location !== 'granted') {
            throw new Error('Location permission was denied on device.')
          }
        }
        const coordinates = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 10000,
        })
        return {
          latitude: coordinates.coords.latitude,
          longitude: coordinates.coords.longitude,
          accuracy: coordinates.coords.accuracy,
        }
      } else if ('geolocation' in navigator) {
        return new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              resolve({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
              })
            },
            (err) => reject(new Error(err.message || 'Failed to acquire location.')),
            { enableHighAccuracy: true, timeout: 15000 }
          )
        })
      } else {
        throw new Error('Geolocation is not supported on this device.')
      }
    } catch (err) {
      console.error('Error getting location:', err)
      throw err
    }
  },

  /**
   * Capture photo directly from Camera or Gallery
   * Returns: { dataUrl, format }
   */
  async captureDocumentPhoto(source = 'camera') {
    try {
      if (Capacitor.isNativePlatform()) {
        const photo = await Camera.getPhoto({
          resultType: CameraResultType.DataUrl,
          source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
          quality: 90,
          allowEditing: false,
        })
        return {
          dataUrl: photo.dataUrl,
          format: photo.format,
        }
      } else {
        throw new Error('Native camera not active; use standard file input.')
      }
    } catch (err) {
      console.warn('Camera capture cancelled or failed:', err)
      throw err
    }
  },

  /**
   * Check device network status
   */
  async getNetworkStatus() {
    try {
      const status = await Network.getStatus()
      return status.connected
    } catch {
      return navigator.onLine
    }
  },
}

export default mobileService
