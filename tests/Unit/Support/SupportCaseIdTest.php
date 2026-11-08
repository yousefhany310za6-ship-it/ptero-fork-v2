<?php

declare(strict_types=1);

use Pterodactyl\Support\SupportCaseId;

it('generates an id from the unambiguous alphabet only', function (): void {
    for ($i = 0; $i < 500; $i++) {
        $id = SupportCaseId::generate();

        expect($id)->toHaveLength(SupportCaseId::LENGTH)
            ->and(SupportCaseId::normalize($id))->toBe($id);
    }
});

it('never uses the characters people mistype', function (): void {
    $ids = [];
    for ($i = 0; $i < 2000; $i++) {
        $ids[] = SupportCaseId::generate();
    }

    $joined = implode('', $ids);

    foreach (['0', '1', 'I', 'O'] as $character) {
        expect(str_contains($joined, $character))->toBeFalse();
    }
});

it('draws ids from the whole alphabet rather than a fixed position', function (): void {
    $seen = [];
    for ($i = 0; $i < 2000; $i++) {
        $seen[SupportCaseId::generate()[0]] = true;
    }

    // A generator wired to something other than a CSPRNG shows up as a first character
    // that never wanders; every position of the alphabet has to appear.
    expect($seen)->toHaveCount(mb_strlen(SupportCaseId::CHARSET));
});

it('rejects ids that cannot collide with a stored one', function (mixed $value): void {
    expect(SupportCaseId::normalize($value))->toBeNull();
})->with([
    'too short' => ['A7K2P'],
    'too long' => ['A7K2P99'],
    'excluded character' => ['A7K2P0'],
    'invalid character' => ['a7k2p!'],
    'empty' => [''],
    'null' => [null],
    'array' => [['A7K2P9']],
]);

it('matches an id typed in any case', function (): void {
    $id = SupportCaseId::generate();

    expect(SupportCaseId::normalize(mb_strtolower($id)))->toBe($id)
        ->and(SupportCaseId::normalize('  '.$id.' '))->toBe($id);
});
