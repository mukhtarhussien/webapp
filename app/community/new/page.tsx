import { requireDb } from '@/db'
import { communityPosts } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { Localized } from '@/components/localized'
import { redirect } from 'next/navigation'

async function createPost(formData: FormData) {
  'use server'

  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  const body = String(formData.get('body') ?? '').trim()

  if (!body) {
    return
  }

  await requireDb().insert(communityPosts).values({
    authorId: user.id,
    body,
    published: true,
    pinned: false,
  })

  redirect('/community')
}

export default async function NewCommunityPost() {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="page-card card">
      <div className="page-title-row">
        <div>
          <h1 className="page-title">
            <Localized
              ar="إنشاء منشور"
              en="Create post"
            />
          </h1>

          <p className="page-subtitle">
            <Localized
              ar="شارك منشورًا مع مجتمع المدرسة."
              en="Share a post with your school community."
            />
          </p>
        </div>
      </div>

      <form action={createPost} style={{ marginTop: 20 }}>
        <label
          htmlFor="body"
          style={{
            display: 'block',
            marginBottom: 8,
            fontWeight: 600,
          }}
        >
          <Localized
            ar="محتوى المنشور"
            en="Post content"
          />
        </label>

        <textarea
          id="body"
          name="body"
          required
          rows={7}
          placeholder="اكتب منشورك هنا..."
          style={{
            width: '100%',
            resize: 'vertical',
            padding: 12,
            borderRadius: 12,
            border: '1px solid #e5e7eb',
            outline: 'none',
            fontSize: 14,
          }}
        />

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            marginTop: 12,
          }}
        >
          <a
            href="/community"
            className="button"
          >
            <Localized
              ar="إلغاء"
              en="Cancel"
            />
          </a>

          <button
            type="submit"
            className="button primary"
          >
            <Localized
              ar="نشر"
              en="Publish"
            />
          </button>
        </div>
      </form>
    </div>
  )
}
