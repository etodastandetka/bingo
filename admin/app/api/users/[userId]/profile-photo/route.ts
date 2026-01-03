import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createApiResponse } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'

// Получение фото профиля пользователя из Telegram
export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    requireAuth(request)

    const userId = params.userId
    
    // Проверяем валидность userId
    try {
      BigInt(userId)
    } catch (e) {
      return NextResponse.json(
        createApiResponse({ photoUrl: null }, 'Invalid user ID'),
        { status: 400 }
      )
    }

    const botToken = process.env.BOT_TOKEN

    if (!botToken) {
      return NextResponse.json(
        createApiResponse(null, 'BOT_TOKEN not configured'),
        { status: 500 }
      )
    }

    // Получаем фото профиля пользователя через Telegram Bot API
    const profilePhotosUrl = `https://api.telegram.org/bot${botToken}/getUserProfilePhotos`
    const profileResponse = await fetch(`${profilePhotosUrl}?user_id=${userId}&limit=1`)
    
    if (!profileResponse.ok) {
      return NextResponse.json(
        createApiResponse({ photoUrl: null }, 'Profile photo not available')
      )
    }

    const profileData = await profileResponse.json()
    
    if (!profileData.ok || !profileData.result?.photos || profileData.result.photos.length === 0) {
      return NextResponse.json(
        createApiResponse({ photoUrl: null }, 'No profile photos found')
      )
    }

    // Получаем file_id (берем самый большой размер - последний элемент)
    const photos = profileData.result.photos[0]
    const largestPhoto = photos[photos.length - 1]
    const fileId = largestPhoto.file_id

    // Получаем путь к файлу
    const getFileUrl = `https://api.telegram.org/bot${botToken}/getFile`
    const fileResponse = await fetch(`${getFileUrl}?file_id=${fileId}`)
    
    if (!fileResponse.ok) {
      return NextResponse.json(
        createApiResponse({ photoUrl: null }, 'Failed to get file path')
      )
    }

    const fileData = await fileResponse.json()
    
    if (!fileData.ok || !fileData.result?.file_path) {
      return NextResponse.json(
        createApiResponse({ photoUrl: null }, 'File path not available')
      )
    }

    const photoUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`

    return NextResponse.json(
      createApiResponse({ photoUrl })
    )
  } catch (error: any) {
    console.error('Profile photo API error:', error)
    return NextResponse.json(
      createApiResponse({ photoUrl: null }, error.message || 'Failed to fetch profile photo'),
      { status: 500 }
    )
  }
}

