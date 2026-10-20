import { and, desc, eq, inArray } from 'drizzle-orm'
import { requireDb } from '@/db'
import { communityComments, communityPostVotes, communityPosts, users } from '@/db/schema'
import { apiError, apiJson, getApiSession, getSiteBaseUrl, readJson } from '@/lib/api/v1'

export const dynamic = 'force-dynamic'
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(request: Request) {
  const auth = await getApiSession(request)
  if (!auth) return apiError('unauthorized', 'سجّل الدخول لعرض مجتمع المدرسة.', 401)

  const db = requireDb()
  const posts = await db.select({
    id: communityPosts.id,
    title: communityPosts.title,
    body: communityPosts.body,
    createdAt: communityPosts.createdAt,
    pinned: communityPosts.pinned,
    authorId: users.id,
    author: users.fullNameAr,
    authorEn: users.fullNameEn,
    authorPreferences: users.preferences,
  })
    .from(communityPosts)
    .innerJoin(users, eq(users.id, communityPosts.authorId))
    .where(eq(communityPosts.published, true))
    .orderBy(desc(communityPosts.pinned), desc(communityPosts.createdAt))
    .limit(40)

  const ids = posts.map(post => post.id)
  if (!ids.length) return apiJson({ posts: [] })

  const [comments, votes] = await Promise.all([
    db.select({
      id: communityComments.id,
      postId: communityComments.postId,
      body: communityComments.body,
      createdAt: communityComments.createdAt,
      authorId: users.id,
      author: users.fullNameAr,
      authorEn: users.fullNameEn,
    })
      .from(communityComments)
      .innerJoin(users, eq(users.id, communityComments.authorId))
      .where(and(
        eq(communityComments.published, true),
        inArray(communityComments.postId, ids),
      ))
      .orderBy(desc(communityComments.createdAt)),

    db.select({
      postId: communityPostVotes.postId,
      userId: communityPostVotes.userId,
      value: communityPostVotes.value,
    })
      .from(communityPostVotes)
      .where(inArray(communityPostVotes.postId, ids)),
  ])

  return apiJson({
    posts: posts.map(post => {
      const { authorPreferences, ...publicPost } = post
      const postVotes = votes.filter(vote => vote.postId === post.id)

      return {
        ...publicPost,
        authorPhotoUrl: authorPreferences?.profilePhotoKey
          ? `${getSiteBaseUrl(request)}/api/profile-photo/${post.authorId}?v=${encodeURIComponent(authorPreferences.profilePhotoKey || '')}`
          : null,
        score: postVotes.reduce((total, vote) => total + vote.value, 0),
        myVote: postVotes.find(vote => vote.userId === auth.user.id)?.value ?? 0,
        comments: comments.filter(comment => comment.postId === post.id),
      }
    }),
  })
}

export async function POST(request: Request) {
  const auth = await getApiSession(request)
  if (!auth) return apiError('unauthorized', 'سجّل الدخول أولًا.', 401)

  const body = await readJson(request)
  if (!body) return apiError('invalid_json', 'صيغة الطلب غير صالحة.', 400)

  const db = requireDb()
  const action = String(body.action || '')

  if (action === 'create') {
    const text = String(body.body || '').trim()
    if (!text || text.length > 5000) {
      return apiError('invalid_body', 'اكتب محتوى للمنشور لا يتجاوز ٥٠٠٠ حرف.', 400)
    }

    const [post] = await db.insert(communityPosts).values({
      authorId: auth.user.id,
      title: String(body.title || '').trim().slice(0, 180) || null,
      body: text,
      published: true,
      pinned: false,
    }).returning({ id: communityPosts.id })

    return apiJson({ id: post.id }, 201)
  }

  const postId = String(body.postId || '')
  if (!uuidPattern.test(postId)) {
    return apiError('invalid_post', 'المنشور غير صالح.', 400)
  }

  const [post] = await db.select({ id: communityPosts.id })
    .from(communityPosts)
    .where(and(
      eq(communityPosts.id, postId),
      eq(communityPosts.published, true),
    ))
    .limit(1)

  if (!post) return apiError('not_found', 'المنشور غير موجود.', 404)

  if (action === 'comment') {
    const text = String(body.body || '').trim()
    if (!text || text.length > 3000) {
      return apiError('invalid_body', 'اكتب تعليقًا لا يتجاوز ٣٠٠٠ حرف.', 400)
    }

    await db.insert(communityComments).values({
      postId,
      authorId: auth.user.id,
      body: text,
      published: true,
    })

    return apiJson({ saved: true }, 201)
  }

  if (action === 'vote') {
    const value = Number(body.value)
    if (value !== 1 && value !== -1) {
      return apiError('invalid_vote', 'قيمة التصويت غير صالحة.', 400)
    }

    const [existing] = await db.select({
      id: communityPostVotes.id,
      value: communityPostVotes.value,
    })
      .from(communityPostVotes)
      .where(and(
        eq(communityPostVotes.postId, postId),
        eq(communityPostVotes.userId, auth.user.id),
      ))
      .limit(1)

    if (!existing) {
      await db.insert(communityPostVotes).values({
        postId,
        userId: auth.user.id,
        value,
      })
    } else if (existing.value === value) {
      await db.delete(communityPostVotes)
        .where(eq(communityPostVotes.id, existing.id))
    } else {
      await db.update(communityPostVotes)
        .set({ value })
        .where(eq(communityPostVotes.id, existing.id))
    }

    return apiJson({ saved: true })
  }

  return apiError('invalid_action', 'الإجراء غير معروف.', 400)
}
