import { expect } from 'chai';
import { Comment, findComment } from './comment';

describe('1 - tests on findReply', () => {
    it('1.1 - if the comment is the reply we are lookiing for then the comment is returned', () => {
        const commentId = '123';
        const theCommentWeAreLookingFor: Comment = {
            id: commentId,
            text: 'I am the comment you are looking for',
        };
        const result = findComment(theCommentWeAreLookingFor, commentId);
        expect(result).to.equal(theCommentWeAreLookingFor);
    });

    it('1.2 - if the reply we are lookiing for is one of the replies contained by the comment then returns the reply', () => {
        const commentId = '123';
        const theCommentWeAreLookingFor: Comment = {
            id: commentId,
            text: 'I am the comment you are looking for',
        };
        const anotherComment: Comment = {
            id: 'another comment',
            text: 'I am another comment',
        };
        const topComment: Comment = {
            id: 'top comment id',
            text: 'I am the top level comment',
            replies: [anotherComment, theCommentWeAreLookingFor],
        };
        const result = findComment(topComment, commentId);
        expect(result).to.equal(theCommentWeAreLookingFor);
    });

    it(`1.3 - the reply we are looking for is nested as reply of a reply`, () => {
        const commentId = '123';
        const theCommentWeAreLookingFor: Comment = {
            id: commentId,
            text: 'I am the comment you are looking for',
        };
        const firstReply: Comment = {
            id: 'firstReply',
            text: 'I am the first replay',
        };
        const secondReply: Comment = {
            id: 'secondReply',
            text: 'I am the second reply',
            replies: [theCommentWeAreLookingFor],
        };
        const topComment: Comment = {
            id: 'top comment id',
            text: 'I am the top level comment',
            replies: [firstReply, secondReply],
        };
        const result = findComment(topComment, commentId);
        expect(result).to.equal(theCommentWeAreLookingFor);
    });

    it(`1.4 - the reply we are looking for is nested as reply of a reply of a reply`, () => {
        const commentId = '123';
        const theCommentWeAreLookingFor: Comment = {
            id: commentId,
            text: 'I am the comment you are looking for',
        };
        const firstReply: Comment = {
            id: 'firstReply',
            text: 'I am the first replay',
        };
        const secondReply: Comment = {
            id: 'secondReply',
            text: 'I am the second reply',
            replies: [],
        };
        const replyToTheSecondReply: Comment = {
            id: 'replyToTheSecondReply',
            text: 'I am a reply to the second reply',
            replies: [theCommentWeAreLookingFor],
        };
        secondReply.replies.push(replyToTheSecondReply);
        const topComment: Comment = {
            id: 'top comment id',
            text: 'I am the top level comment',
            replies: [firstReply, secondReply],
        };
        const result = findComment(topComment, commentId);
        expect(result).to.equal(theCommentWeAreLookingFor);
    });

    it(`1.5 - the reply we are looking for is not a reply of this comment`, () => {
        const theCommentWeAreLookingFor: Comment = {
            id: 'theCommentWeAreLookingFor',
            text: 'I am the comment you are looking for',
        };
        const firstReply: Comment = {
            id: 'firstReply',
            text: 'I am the first replay',
        };
        const secondReply: Comment = {
            id: 'secondReply',
            text: 'I am the second reply',
            replies: [],
        };
        const replyToTheSecondReply: Comment = {
            id: 'replyToTheSecondReply',
            text: 'I am a reply to the second reply',
            replies: [theCommentWeAreLookingFor],
        };
        secondReply.replies.push(replyToTheSecondReply);
        const topComment: Comment = {
            id: 'top comment id',
            text: 'I am the top level comment',
            replies: [firstReply, secondReply],
        };
        const result = findComment(topComment, 'the reply which does not exist');
        expect(result).to.be.undefined;
    });
});
