import Link from 'next/link'
import {
  and,
  desc,
  eq,
  inArray,
} from 'drizzle-orm'
import {
  ArrowDown,
  ArrowUp,
  MessageCircle,
  Send,
  Users,
} from 'lucide-react'
import { requireDb } from '@/db'
import {
  communityComments,
  communityPostVotes,
  communityPosts,
  users,
} from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { Localized } from '@/components/localized'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

function relativeTime(date: Date) {
  const diff =
    Date.now() - date.getTime()

  const seconds = Math.floor(diff / 1000)

  if (seconds < 60) {
    return 'الآن'
  }

  const minutes = Math.floor(
    seconds / 60
  )

  if (minutes < 60) {
    return `قبل ${minutes} دقيقة`
  }

  const hours = Math.floor(
    minutes / 60
  )

  if (hours < 24) {
    return `قبل ${hours} ساعة`
  }

  const days = Math.floor(
    hours / 24
  )

  if (days < 30) {
    return `قبل ${days} يوم`
  }

  const months = Math.floor(
    days / 30
  )

  if (months < 12) {
    return `قبل ${months} شهر`
  }

  const years = Math.floor(
    months / 12
  )

  return `قبل ${years} سنة`
}

async function createComment(
  formData: FormData
) {
  'use server'

  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  const postId = String(
    formData.get('postId') ?? ''
  ).trim()

  const body = String(
    formData.get('body') ?? ''
  ).trim()

  if (!postId || !body) {
    return
  }

  await requireDb()
    .insert(communityComments)
    .values({
      postId,
      authorId: user.id,
      body,
      published: true,
    })
}

async function votePost(
  formData: FormData
) {
  'use server'

  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  const postId = String(
    formData.get('postId') ?? ''
  ).trim()

  const rawValue = Number(
    formData.get('value')
  )

  if (
    !postId ||
    (rawValue !== 1 && rawValue !== -1)
  ) {
    return
  }

  const db = requireDb()

  const existing = await db
    .select({
      id: communityPostVotes.id,
      value: communityPostVotes.value,
    })
    .from(communityPostVotes)
    .where(
      and(
        eq(
          communityPostVotes.postId,
          postId
        ),
        eq(
          communityPostVotes.userId,
          user.id
        )
      )
    )
    .limit(1)

  if (existing.length === 0) {
    await db
      .insert(communityPostVotes)
      .values({
        postId,
        userId: user.id,
        value: rawValue,
      })

    return
  }

  const current =
    existing[0]

  if (current.value === rawValue) {
    await db
      .delete(communityPostVotes)
      .where(
        eq(
          communityPostVotes.id,
          current.id
        )
      )

    return
  }

  await db
    .update(communityPostVotes)
    .set({
      value: rawValue,
    })
    .where(
      eq(
        communityPostVotes.id,
        current.id
      )
    )
}

export default async function Community() {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  const db = requireDb()

  const rows = await db
    .select({
      id: communityPosts.id,
      body: communityPosts.body,
      createdAt:
        communityPosts.createdAt,
      pinned: communityPosts.pinned,
      authorId: users.id,
      author: users.fullNameAr,
      authorEn: users.fullNameEn,
      authorPreferences: users.preferences,
    })
    .from(communityPosts)
    .innerJoin(
      users,
      eq(
        users.id,
        communityPosts.authorId
      )
    )
    .where(
      eq(
        communityPosts.published,
        true
      )
    )
    .orderBy(
      desc(communityPosts.pinned),
      desc(
        communityPosts.createdAt
      )
    )
    .limit(40)

  const postIds = rows.map(
    (post) => post.id
  )

  const comments = postIds.length
    ? await db
        .select({
          id: communityComments.id,
          postId:
            communityComments.postId,
          body:
            communityComments.body,
          createdAt:
            communityComments.createdAt,
          authorId:
            users.id,
          author:
            users.fullNameAr,
          authorEn:
            users.fullNameEn,
          authorPreferences:
            users.preferences,
        })
        .from(communityComments)
        .innerJoin(
          users,
          eq(
            users.id,
            communityComments.authorId
          )
        )
        .where(
          and(
            eq(
              communityComments.published,
              true
            ),
            inArray(
              communityComments.postId,
              postIds
            )
          )
        )
        .orderBy(
          desc(
            communityComments.createdAt
          )
        )
    : []

  const votes = postIds.length
    ? await db
        .select({
          id: communityPostVotes.id,
          postId:
            communityPostVotes.postId,
          userId:
            communityPostVotes.userId,
          value:
            communityPostVotes.value,
        })
        .from(communityPostVotes)
        .where(
          inArray(
            communityPostVotes.postId,
            postIds
          )
        )
    : []

  const commentsByPost =
    new Map<
      string,
      typeof comments
    >()

  for (const comment of comments) {
    const existing =
      commentsByPost.get(
        comment.postId
      ) ?? []

    existing.push(comment)

    commentsByPost.set(
      comment.postId,
      existing
    )
  }

  const votesByPost =
    new Map<
      string,
      typeof votes
    >()

  for (const vote of votes) {
    const existing =
      votesByPost.get(
        vote.postId
      ) ?? []

    existing.push(vote)

    votesByPost.set(
      vote.postId,
      existing
    )
  }

  return (
    <div className="page-card card">
      <div className="page-title-row">
        <div>
          <h1 className="page-title">
            <Localized
              ar="المجتمع"
              en="Community"
            />
          </h1>

          <p className="page-subtitle">
            <Localized
              ar="منشورات منشورة من مجتمع المدرسة."
              en="Published posts from your school community."
            />
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems:
              'center',
            gap: 8,
          }}
        >
          <Link
            href="/community/new"
            className="button primary"
          >
            +
            <Localized
              ar="إنشاء منشور"
              en="Create post"
            />
          </Link>

          <div className="stat-icon purple">
            <Users size={20} />
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 12,
        }}
      >
        {rows.length ? (
          rows.map((p) => {
            const postComments =
              commentsByPost.get(
                p.id
              ) ?? []

            const postVotes =
              votesByPost.get(
                p.id
              ) ?? []

            const score =
              postVotes.reduce(
                (total, vote) =>
                  total + vote.value,
                0
              )

            const myVote =
              postVotes.find(
                (vote) =>
                  vote.userId ===
                  user.id
              )?.value ?? 0

            return (
              <div
                className="community-post"
                key={p.id}
                style={{
                  padding:
                    '15px 4px',
                }}
              >
                <span className="avatar purple">
                  {p.authorPreferences?.profilePhotoKey
                    ? <img src={`/api/profile-photo/${p.authorId}?v=${encodeURIComponent(p.authorPreferences.profilePhotoKey)}`} alt="" />
                    : p.author.slice(0, 1)}
                </span>

                <div
                  style={{
                    flex: 1,
                  }}
                >
                  {/* Header */}
                  <div
                    style={{
                      display:
                        'flex',
                      justifyContent:
                        'space-between',
                      gap: 12,
                    }}
                  >
                    <strong>
                      <Localized
                        ar={
                          p.author
                        }
                        en={
                          p.authorEn
                        }
                      />
                    </strong>

                    <span
                      title={p.createdAt.toLocaleString(
                        'ar-IQ'
                      )}
                      style={{
                        fontSize: 8,
                        color:
                          '#9aa1af',
                        whiteSpace:
                          'nowrap',
                      }}
                    >
                      {relativeTime(
                        p.createdAt
                      )}
                    </span>
                  </div>

                  {/* Post */}
                  <p
                    style={{
                      fontSize: 10,
                      marginTop: 5,
                      whiteSpace:
                        'pre-wrap',
                    }}
                  >
                    {p.body}
                  </p>

                  {/* Actions */}
                  <div
                    style={{
                      display:
                        'flex',
                      alignItems:
                        'center',
                      gap: 4,
                      marginTop: 10,
                    }}
                  >
                    {/* Upvote */}
                    <form
                      action={
                        votePost
                      }
                    >
                      <input
                        type="hidden"
                        name="postId"
                        value={p.id}
                      />

                      <input
                        type="hidden"
                        name="value"
                        value="1"
                      />

                      <button
                        type="submit"
                        aria-label="Upvote"
                        title="Upvote"
                        className="button"
                        style={{
                          display:
                            'inline-flex',
                          alignItems:
                            'center',
                          justifyContent:
                            'center',
                          padding:
                            '5px 7px',
                          color:
                            myVote === 1
                              ? '#2563eb'
                              : '#6b7280',
                          background:
                            myVote === 1
                              ? '#eff6ff'
                              : 'transparent',
                          border:
                            'none',
                        }}
                      >
                        <ArrowUp
                          size={16}
                          strokeWidth={
                            myVote === 1
                              ? 3
                              : 2
                          }
                        />
                      </button>
                    </form>

                    {/* Score */}
                    <span
                      style={{
                        minWidth: 25,
                        textAlign:
                          'center',
                        fontSize: 10,
                        fontWeight: 700,
                        color:
                          score > 0
                            ? '#2563eb'
                            : score < 0
                              ? '#dc2626'
                              : '#6b7280',
                      }}
                    >
                      {score}
                    </span>

                    {/* Downvote */}
                    <form
                      action={
                        votePost
                      }
                    >
                      <input
                        type="hidden"
                        name="postId"
                        value={p.id}
                      />

                      <input
                        type="hidden"
                        name="value"
                        value="-1"
                      />

                      <button
                        type="submit"
                        aria-label="Downvote"
                        title="Downvote"
                        className="button"
                        style={{
                          display:
                            'inline-flex',
                          alignItems:
                            'center',
                          justifyContent:
                            'center',
                          padding:
                            '5px 7px',
                          color:
                            myVote === -1
                              ? '#dc2626'
                              : '#6b7280',
                          background:
                            myVote === -1
                              ? '#fef2f2'
                              : 'transparent',
                          border:
                            'none',
                        }}
                      >
                        <ArrowDown
                          size={16}
                          strokeWidth={
                            myVote === -1
                              ? 3
                              : 2
                          }
                        />
                      </button>
                    </form>

                    {/* Comments */}
                    <span
                      style={{
                        display:
                          'inline-flex',
                        alignItems:
                          'center',
                        gap: 4,
                        marginLeft: 8,
                        color:
                          '#6b7280',
                        fontSize: 8,
                      }}
                    >
                      <MessageCircle
                        size={15}
                      />

                      {
                        postComments.length
                      }
                    </span>

                    {/* Pinned */}
                    {p.pinned && (
                      <span
                        title="Pinned"
                        style={{
                          marginLeft: 6,
                          fontSize: 8,
                          color:
                            '#6b7280',
                        }}
                      >
                        📌
                      </span>
                    )}
                  </div>

                  {/* Comments */}
                  <div
                    style={{
                      marginTop: 12,
                      paddingTop: 10,
                      borderTop:
                        '1px solid #eee',
                    }}
                  >
                    {postComments.length >
                      0 && (
                      <div
                        style={{
                          display:
                            'grid',
                          gap: 9,
                          marginBottom:
                            12,
                        }}
                      >
                        {postComments.map(
                          (
                            comment
                          ) => (
                            <div
                              key={
                                comment.id
                              }
                              style={{
                                display:
                                  'flex',
                                gap: 8,
                                alignItems:
                                  'flex-start',
                              }}
                            >
                              <span className="avatar purple">
                                {comment.authorPreferences?.profilePhotoKey
                                  ? <img src={`/api/profile-photo/${comment.authorId}?v=${encodeURIComponent(comment.authorPreferences.profilePhotoKey)}`} alt="" />
                                  : comment.author.slice(0, 1)}
                              </span>

                              <div
                                style={{
                                  flex: 1,
                                  background:
                                    '#f8f9fb',
                                  borderRadius:
                                    10,
                                  padding:
                                    '8px 10px',
                                }}
                              >
                                <div
                                  style={{
                                    display:
                                      'flex',
                                    justifyContent:
                                      'space-between',
                                    gap: 8,
                                  }}
                                >
                                  <strong
                                    style={{
                                      fontSize: 9,
                                    }}
                                  >
                                    <Localized
                                      ar={
                                        comment.author
                                      }
                                      en={
                                        comment.authorEn
                                      }
                                    />
                                  </strong>

                                  <span
                                    title={comment.createdAt.toLocaleString(
                                      'ar-IQ'
                                    )}
                                    style={{
                                      fontSize: 7,
                                      color:
                                        '#9aa1af',
                                      whiteSpace:
                                        'nowrap',
                                    }}
                                  >
                                    {relativeTime(
                                      comment.createdAt
                                    )}
                                  </span>
                                </div>

                                <p
                                  style={{
                                    fontSize: 9,
                                    marginTop:
                                      4,
                                    whiteSpace:
                                      'pre-wrap',
                                  }}
                                >
                                  {
                                    comment.body
                                  }
                                </p>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    )}

                    {/* Comment form */}
                    <form
                      action={
                        createComment
                      }
                      style={{
                        display:
                          'flex',
                        gap: 8,
                        alignItems:
                          'flex-end',
                      }}
                    >
                      <input
                        type="hidden"
                        name="postId"
                        value={p.id}
                      />

                      <textarea
                        name="body"
                        required
                        rows={2}
                        placeholder="اكتب تعليقك..."
                        style={{
                          flex: 1,
                          resize:
                            'vertical',
                          minHeight:
                            42,
                          padding:
                            '9px 10px',
                          borderRadius:
                            10,
                          border:
                            '1px solid #e5e7eb',
                          outline:
                            'none',
                          fontSize: 10,
                        }}
                      />

                      <button
                        type="submit"
                        className="button primary"
                        aria-label="إرسال التعليق"
                        title="إرسال التعليق"
                        style={{
                          display:
                            'inline-flex',
                          alignItems:
                            'center',
                          justifyContent:
                            'center',
                          width: 40,
                          height: 40,
                          padding: 0,
                        }}
                      >
                        <Send
                          size={15}
                        />
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )
          })
        ) : (
          <p className="admin-empty">
            <Localized
              ar="لا توجد منشورات منشورة."
              en="No published posts."
            />
          </p>
        )}
      </div>
    </div>
  )
                      }
