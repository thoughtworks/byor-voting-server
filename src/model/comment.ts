export interface Comment {
    timestamp?: string;
    id?: string;
    // author can become an object representing the author
    author?: string;
    text: string;
    replies?: Comment[];
}

export function buildComment(text: string, author?: string) {
    const ret: Comment = {
        text,
        id: new Date(Date.now()).toISOString(),
        timestamp: new Date(Date.now()).toISOString(),
        author,
    };
    return ret;
}

// finds a comment, identified by its id, which is stored in a comment as reply
export function findComment(comment: Comment, commentId: string) {
    if (comment.id === commentId) {
        return comment;
    } else {
        if (comment.replies) {
            for (let reply of comment.replies) {
                const res: Comment = findComment(reply, commentId);
                if (res) {
                    return res;
                }
            }
        } else {
            return null;
        }
    }
}
