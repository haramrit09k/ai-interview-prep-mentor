import React from 'react';
import { marked, type Tokens } from 'marked';
import DOMPurify from 'dompurify';

interface MarkdownRendererProps {
  content: string | null;
  className?: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => {
    if (!content) return null;

    // Configure marked to add a target="_blank" to links
    const renderer = new marked.Renderer();
    
    // In newer versions of marked, the 'link' renderer function receives a single
    // token object instead of separate (href, title, text) arguments.
    renderer.link = (token: Tokens.Link) => {
        const link = marked.Renderer.prototype.link.call(renderer, token);
        // The default renderer can return false, so we must check for a string.
        if (typeof link === 'string') {
            return link.replace('<a', '<a target="_blank" rel="noopener noreferrer"');
        }
        return link;
    };
    
    marked.setOptions({ renderer });
    
    const dirtyHtml = marked.parse(content) as string;
    // Allow target="_blank" for links
    const cleanHtml = DOMPurify.sanitize(dirtyHtml, { ADD_ATTR: ['target'] });
    
    return (
        <div 
            className={`prose prose-invert max-w-none prose-p:text-text-secondary prose-li:text-text-secondary prose-p:text-sm sm:prose-p:text-base prose-li:text-sm sm:prose-li:text-base ${className || ''}`}
            dangerouslySetInnerHTML={{ __html: cleanHtml }} 
        />
    );
}

export default MarkdownRenderer;
