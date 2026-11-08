<?php

declare(strict_types=1);

namespace Monitoring\Alerts;

final readonly class Message
{
    public function __construct(
        public string $title,
        public string $body,
        public bool $resolved,
        public ?string $url = null,
    ) {}

    /** @param array{title: string, body: string, resolved: bool, url: string|null} $data */
    public static function fromArray(array $data): self
    {
        return new self($data['title'], $data['body'], $data['resolved'], $data['url']);
    }

    /** @return array{title: string, body: string, resolved: bool, url: string|null} */
    public function toArray(): array
    {
        return ['title' => $this->title, 'body' => $this->body, 'resolved' => $this->resolved, 'url' => $this->url];
    }
}
